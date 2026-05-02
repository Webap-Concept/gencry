// lib/auth/sessions.ts
//
// Logica server-side delle sessioni utente. Il cookie `session` contiene
// solo un session-id opaco (firmato in JWT per integrità); la validazione
// passa per Redis (cache 60s) e fallback su Postgres. Permette revoca
// immediata (signOut, cambio password, admin), lista sessioni in UI, e
// idle timeout senza dover aspettare la scadenza del cookie.

import "server-only";
import { db } from "@/lib/db/drizzle";
import { sessions } from "@/lib/db/schema";
import { and, desc, eq, gt, isNull, ne, sql } from "drizzle-orm";
import { redisCmd } from "@/lib/auth/rate-limit-redis";

export const SESSION_DURATION_DAYS = 15;
export const SESSION_IDLE_TIMEOUT_DAYS = 15;

/** TTL della cache Redis sulla validazione di una sessione. */
const CACHE_TTL_SECONDS = 60;

/**
 * Throttle dell'aggiornamento `last_seen_at`: se l'ultimo update è più
 * recente di questa soglia, skippiamo. Riduce la write pressure e
 * mantiene la sessione "attiva" lato idle-timeout.
 */
const LAST_SEEN_THROTTLE_MS = 5 * 60 * 1000;

const CACHE_PREFIX = "session:";

type CachedSession = {
  userId: string;
  role: string;
  expiresAt: string; // ISO
  lastSeenAt: string; // ISO
  /** Quando inseriamo in cache, settiamo questo per il throttle locale. */
  cachedAt: number;
};

// ---------------------------------------------------------------------------
// Create / revoke
// ---------------------------------------------------------------------------

export type CreateSessionInput = {
  userId: string;
  role: string;
  deviceToken: string | null;
  userAgent: string | null;
  ip: string | null;
};

/** Crea una nuova sessione attiva e ritorna l'id da imbustare nel cookie. */
export async function createSession(
  input: CreateSessionInput,
): Promise<{ id: string; expiresAt: Date }> {
  const expiresAt = new Date(
    Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000,
  );

  const [row] = await db
    .insert(sessions)
    .values({
      userId: input.userId,
      deviceToken: input.deviceToken,
      userAgent: input.userAgent,
      ip: input.ip,
      expiresAt,
    })
    .returning({ id: sessions.id });

  // Pre-popola la cache: il primo getSession dopo il login non tocca DB.
  await writeCache(row.id, {
    userId: input.userId,
    role: input.role,
    expiresAt: expiresAt.toISOString(),
    lastSeenAt: new Date().toISOString(),
    cachedAt: Date.now(),
  });

  return { id: row.id, expiresAt };
}

/**
 * Marca la sessione come revocata e invalida la cache. Se la sessione
 * non esiste o è già revocata, no-op.
 *
 * Quando il chiamante è un'azione utente (revoca da UI), passare anche
 * `userId` per ownership check: l'UPDATE applica solo se la sessione
 * appartiene all'utente. Senza userId la revoca è incondizionata
 * (caso d'uso: signOut della sessione corrente, il chiamante l'ha già
 * letta dal cookie firmato).
 */
export async function revokeSession(
  sessionId: string,
  userId?: string,
): Promise<void> {
  const condition = userId
    ? and(
        eq(sessions.id, sessionId),
        eq(sessions.userId, userId),
        isNull(sessions.revokedAt),
      )
    : and(eq(sessions.id, sessionId), isNull(sessions.revokedAt));

  await db.update(sessions).set({ revokedAt: new Date() }).where(condition);
  await invalidateCache(sessionId);
}

/**
 * Revoca tutte le sessioni dell'utente tranne (opzionalmente) quella
 * specificata. Usato al cambio password per kickare gli altri device
 * lasciando in piedi quello corrente.
 */
export async function revokeAllUserSessions(params: {
  userId: string;
  exceptSessionId?: string;
}): Promise<{ revokedCount: number; revokedIds: string[] }> {
  const { userId, exceptSessionId } = params;

  const condition = exceptSessionId
    ? and(
        eq(sessions.userId, userId),
        isNull(sessions.revokedAt),
        ne(sessions.id, exceptSessionId),
      )
    : and(eq(sessions.userId, userId), isNull(sessions.revokedAt));

  const revoked = await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(condition)
    .returning({ id: sessions.id });

  await Promise.all(revoked.map((r) => invalidateCache(r.id)));

  return {
    revokedCount: revoked.length,
    revokedIds: revoked.map((r) => r.id),
  };
}

// ---------------------------------------------------------------------------
// Validate (cache → DB)
// ---------------------------------------------------------------------------

export type ValidatedSession = {
  sessionId: string;
  userId: string;
  role: string;
  expiresAt: Date;
};

/**
 * Valida una sessione lookup-first cache, fallback DB. Se la sessione è
 * scaduta, idle-timeoutata o revocata ritorna null. Aggiorna `last_seen_at`
 * con throttle (no DB write se entro LAST_SEEN_THROTTLE_MS dall'ultimo).
 */
export async function getValidSession(
  sessionId: string,
): Promise<ValidatedSession | null> {
  const cached = await readCache(sessionId);
  if (cached) {
    if (!isStillValid(cached)) {
      await invalidateCache(sessionId);
      return null;
    }
    // Touch last_seen lazy: solo se servirebbe + asincrono.
    maybeTouchLastSeen(sessionId, cached);
    return {
      sessionId,
      userId: cached.userId,
      role: cached.role,
      expiresAt: new Date(cached.expiresAt),
    };
  }

  // Cache miss → DB. Join con users per ottenere il role corrente
  // (così se l'admin cambia il role la sessione lo riflette dopo TTL).
  // Raw SQL: la query include un join con users per leggere il role
  // corrente (così cambi di role lato admin si propagano dopo il TTL
  // della cache) + filtri su deleted_at/banned_at. Questa è hot path
  // ma 1x per sessione/minuto grazie alla cache, quindi chiarezza > ORM.
  const result = await db.execute<{
    id: string;
    user_id: string;
    role: string;
    expires_at: string;
    last_seen_at: string;
    revoked_at: string | null;
  }>(sql`
    SELECT s.id, s.user_id, s.expires_at, s.last_seen_at, s.revoked_at, u.role
    FROM sessions s
    INNER JOIN users u ON u.id = s.user_id
    WHERE s.id = ${sessionId}
      AND u.deleted_at IS NULL
      AND u.banned_at IS NULL
    LIMIT 1
  `);

  const row = (result as unknown as Array<{
    id: string;
    user_id: string;
    role: string;
    expires_at: string;
    last_seen_at: string;
    revoked_at: string | null;
  }>)[0];

  if (!row) return null;
  if (row.revoked_at) return null;

  const expiresAt = new Date(row.expires_at);
  const lastSeenAt = new Date(row.last_seen_at);
  const now = new Date();

  if (expiresAt <= now) return null;
  if (
    now.getTime() - lastSeenAt.getTime() >
    SESSION_IDLE_TIMEOUT_DAYS * 24 * 60 * 60 * 1000
  ) {
    return null;
  }

  const next: CachedSession = {
    userId: row.user_id,
    role: row.role,
    expiresAt: row.expires_at,
    lastSeenAt: row.last_seen_at,
    cachedAt: Date.now(),
  };
  await writeCache(sessionId, next);
  maybeTouchLastSeen(sessionId, next);

  return {
    sessionId,
    userId: row.user_id,
    role: row.role,
    expiresAt,
  };
}

function isStillValid(cached: CachedSession): boolean {
  const now = Date.now();
  if (new Date(cached.expiresAt).getTime() <= now) return false;
  if (
    now - new Date(cached.lastSeenAt).getTime() >
    SESSION_IDLE_TIMEOUT_DAYS * 24 * 60 * 60 * 1000
  ) {
    return false;
  }
  return true;
}

/**
 * Aggiorna `last_seen_at` se l'ultimo touch è oltre il throttle. Non
 * awaited dal chiamante: fire-and-forget per non aggiungere latency
 * al render. La cache resta consistent perché alla prossima cache miss
 * leggeremo il valore aggiornato dal DB.
 */
function maybeTouchLastSeen(sessionId: string, cached: CachedSession): void {
  const now = Date.now();
  if (now - new Date(cached.lastSeenAt).getTime() < LAST_SEEN_THROTTLE_MS) {
    return;
  }
  // Aggiorno la cache copia subito (evita più update concorrenti),
  // poi DB in background. Errori loggati ma non rilanciati.
  const nextLastSeen = new Date(now).toISOString();
  void (async () => {
    try {
      await writeCache(sessionId, {
        ...cached,
        lastSeenAt: nextLastSeen,
        cachedAt: now,
      });
      await db
        .update(sessions)
        .set({ lastSeenAt: new Date(now) })
        .where(eq(sessions.id, sessionId));
    } catch (err) {
      console.error("[sessions] last_seen update failed:", err);
    }
  })();
}

// ---------------------------------------------------------------------------
// Listing per la UI di Sicurezza (PR-D)
// ---------------------------------------------------------------------------

export type UserSession = {
  id: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  isCurrent: boolean;
};

/**
 * Lista delle sessioni attive dell'utente (non revocate, non scadute).
 * `currentSessionId` viene usato solo per marcare il flag `isCurrent`.
 */
export async function listActiveSessions(params: {
  userId: string;
  currentSessionId: string | null;
}): Promise<UserSession[]> {
  const { userId, currentSessionId } = params;

  const rows = await db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.userId, userId),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(sessions.lastSeenAt));

  return rows
    .filter((r) => {
      const idleCutoff =
        r.lastSeenAt.getTime() +
        SESSION_IDLE_TIMEOUT_DAYS * 24 * 60 * 60 * 1000;
      return idleCutoff > Date.now();
    })
    .map((r) => ({
      id: r.id,
      userAgent: r.userAgent,
      ip: r.ip,
      createdAt: r.createdAt,
      lastSeenAt: r.lastSeenAt,
      expiresAt: r.expiresAt,
      isCurrent: currentSessionId !== null && r.id === currentSessionId,
    }));
}

// ---------------------------------------------------------------------------
// Cache helpers (Redis Upstash)
// ---------------------------------------------------------------------------

async function readCache(sessionId: string): Promise<CachedSession | null> {
  try {
    const raw = await redisCmd<string | null>([
      "GET",
      CACHE_PREFIX + sessionId,
    ]);
    if (!raw) return null;
    return JSON.parse(raw) as CachedSession;
  } catch (err) {
    // Redis down → fallback DB. Niente crash.
    console.error("[sessions/cache] readCache failed:", err);
    return null;
  }
}

async function writeCache(
  sessionId: string,
  payload: CachedSession,
): Promise<void> {
  try {
    await redisCmd<string>([
      "SET",
      CACHE_PREFIX + sessionId,
      JSON.stringify(payload),
      "EX",
      String(CACHE_TTL_SECONDS),
    ]);
  } catch (err) {
    console.error("[sessions/cache] writeCache failed:", err);
  }
}

async function invalidateCache(sessionId: string): Promise<void> {
  try {
    await redisCmd<number>(["DEL", CACHE_PREFIX + sessionId]);
  } catch (err) {
    console.error("[sessions/cache] invalidateCache failed:", err);
  }
}
