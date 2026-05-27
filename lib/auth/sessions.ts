// lib/auth/sessions.ts
//
// Logica server-side delle sessioni utente. Il cookie `session` contiene
// solo un session-id opaco (firmato in JWT per integrità); la validazione
// passa per Redis (cache 60s) e fallback su Postgres. Permette revoca
// immediata (signOut, cambio password, admin), lista sessioni in UI, e
// idle timeout senza dover aspettare la scadenza del cookie.

import "server-only";
import { cache } from "react";
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
  /** Pointer alla session admin originale se questa e' una sessione
   *  impersonation. Null per le sessioni normali. Banner + stop button
   *  letti da `getSession()` consumano questo campo. */
  impersonatorSessionId: string | null;
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
  /** Pointer alla session admin che ha avviato un'impersonation. Null
   *  per le sessioni normali. Vedi adminStartImpersonation. */
  impersonatorSessionId?: string | null;
  /** Override della durata (default SESSION_DURATION_DAYS = 15 giorni).
   *  Usato dall'impersonation per forzare expiry 30 min. */
  durationMs?: number;
};

/** Crea una nuova sessione attiva e ritorna l'id da imbustare nel cookie. */
export async function createSession(
  input: CreateSessionInput,
): Promise<{ id: string; expiresAt: Date }> {
  const durationMs =
    input.durationMs ?? SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000;
  const expiresAt = new Date(Date.now() + durationMs);

  const [row] = await db
    .insert(sessions)
    .values({
      userId: input.userId,
      deviceToken: input.deviceToken,
      userAgent: input.userAgent,
      ip: input.ip,
      expiresAt,
      impersonatorSessionId: input.impersonatorSessionId ?? null,
    })
    .returning({ id: sessions.id });

  // Pre-popola la cache: il primo getSession dopo il login non tocca DB.
  await writeCache(row.id, {
    userId: input.userId,
    role: input.role,
    expiresAt: expiresAt.toISOString(),
    lastSeenAt: new Date().toISOString(),
    cachedAt: Date.now(),
    impersonatorSessionId: input.impersonatorSessionId ?? null,
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
  /** Set se la sessione corrente e' una impersonation aperta da un admin.
   *  Il banner top dell'app legge questo per mostrare "Stai impersonando..."
   *  + bottone Termina. */
  impersonatorSessionId: string | null;
};

/**
 * Valida una sessione lookup-first cache, fallback DB. Se la sessione è
 * scaduta, idle-timeoutata o revocata ritorna null. Aggiorna `last_seen_at`
 * con throttle (no DB write se entro LAST_SEEN_THROTTLE_MS dall'ultimo).
 *
 * Wrapped in `React.cache()`: all'interno della stessa RSC render, chiamate
 * multiple con lo stesso `sessionId` (proxy + layout + nested layouts +
 * page + slot paralleli) si deduplicano a UN solo GET su Redis. Senza
 * questo wrap il feed faceva ~16 GET `session:*` per page-load. Scope è
 * per-request: zero rischio di leak cross-utente. Edge runtime (proxy.ts)
 * non beneficia ma non regredisce.
 */
export const getValidSession = cache(_getValidSession);

async function _getValidSession(
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
      impersonatorSessionId: cached.impersonatorSessionId,
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
    impersonator_session_id: string | null;
  }>(sql`
    SELECT s.id, s.user_id, s.expires_at, s.last_seen_at, s.revoked_at,
           s.impersonator_session_id, u.role
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
    impersonator_session_id: string | null;
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
    impersonatorSessionId: row.impersonator_session_id,
  };
  await writeCache(sessionId, next);
  maybeTouchLastSeen(sessionId, next);

  return {
    sessionId,
    userId: row.user_id,
    role: row.role,
    expiresAt,
    impersonatorSessionId: row.impersonator_session_id,
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
      // SQLSTATE 08006 / EAUTHTIMEOUT è un sintomo classico di Vercel
      // serverless + Supabase pooler: una connessione TCP cached tra
      // invocazioni viene killed dal pooler (idle/restart) e postgres.js
      // se ne accorge solo al prossimo handshake che va in timeout. Il
      // last_seen_at è telemetria non critica e questa write è già
      // fire-and-forget — demotiamo a `warn` per evitare di scatenare
      // alert su un errore transient atteso. Tutto il resto resta `error`.
      const code = (err as { code?: string } | null | undefined)?.code;
      const causeCode = (err as { cause?: { code?: string } } | null | undefined)?.cause?.code;
      const isPoolerTimeout =
        code === "08006" || causeCode === "08006" || causeCode === "EAUTHTIMEOUT";
      if (isPoolerTimeout) {
        console.warn("[sessions] last_seen update transient pooler timeout:", code ?? causeCode);
      } else {
        console.error("[sessions] last_seen update failed:", err);
      }
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

/**
 * Cache in-process del readCache. Risolve un pattern visto via
 * UPSTASH_DEBUG: anche con `React.cache()` su `getValidSession`,
 * Turbopack dev (e potenzialmente parallel routes / Suspense boundary
 * in prod) NON dedupa affidabilmente cross-chunk → vedevamo 5 GET
 * `session:*` per UN page-load admin.
 *
 * TTL 5s: copre la finestra "render di una page (≤200ms) + cleanup"
 * senza rendere stale per la finestra umana. Worst case di propagazione
 * revoca: 5s (local) + 60s (Redis TTL) = 65s totali, vs 60s di prima.
 * Trascurabile.
 *
 * writeCache + invalidateCache fanno `delete` qui per forzare un
 * refresh immediato (write-through invalidation).
 */
const LOCAL_READ_TTL_MS = 5_000;
const localReadCache = new Map<
  string,
  { value: CachedSession | null; expiry: number }
>();

async function readCache(sessionId: string): Promise<CachedSession | null> {
  const now = Date.now();
  const local = localReadCache.get(sessionId);
  if (local && now < local.expiry) return local.value;

  try {
    const raw = await redisCmd<string | null>([
      "GET",
      CACHE_PREFIX + sessionId,
    ]);
    const parsed = raw ? (JSON.parse(raw) as CachedSession) : null;
    localReadCache.set(sessionId, { value: parsed, expiry: now + LOCAL_READ_TTL_MS });
    return parsed;
  } catch (err) {
    // Redis down → fallback DB. Niente crash.
    console.error("[sessions/cache] readCache failed:", err);
    return null;
  }
}

/**
 * Throttle in-process del SET. Risolve un pattern visto via UPSTASH_DEBUG:
 * proxy + layouts + RSC stream chunks chiamavano `maybeTouchLastSeen`
 * ognuno separatamente generando 4 SET sulla stessa key per UNO solo
 * page-load. Con questo throttle: 1 SET ogni 30s per sessionId per
 * processo. In edge runtime ogni invocation è isolata (la Map non
 * sopravvive cross-cold-start) → degrada al comportamento pre-throttle,
 * mai peggio. In Node runtime + Vercel warm lambda ~elimina i SET
 * duplicati. */
const WRITE_THROTTLE_MS = 30_000;
const lastWriteAt = new Map<string, number>();

async function writeCache(
  sessionId: string,
  payload: CachedSession,
): Promise<void> {
  const now = Date.now();
  const last = lastWriteAt.get(sessionId);
  if (last && now - last < WRITE_THROTTLE_MS) return;
  lastWriteAt.set(sessionId, now);
  // Update locale: il prossimo readCache vede subito il nuovo payload
  // senza fare round-trip Redis. Coerente perché lo abbiamo appena scritto.
  localReadCache.set(sessionId, {
    value: payload,
    expiry: now + LOCAL_READ_TTL_MS,
  });
  try {
    await redisCmd<string>([
      "SET",
      CACHE_PREFIX + sessionId,
      JSON.stringify(payload),
      "EX",
      String(CACHE_TTL_SECONDS),
    ]);
  } catch (err) {
    // Su errore reset entrambi: il prossimo readCache deve riprovare.
    lastWriteAt.delete(sessionId);
    localReadCache.delete(sessionId);
    console.error("[sessions/cache] writeCache failed:", err);
  }
}

async function invalidateCache(sessionId: string): Promise<void> {
  lastWriteAt.delete(sessionId);
  localReadCache.delete(sessionId);
  try {
    await redisCmd<number>(["DEL", CACHE_PREFIX + sessionId]);
  } catch (err) {
    console.error("[sessions/cache] invalidateCache failed:", err);
  }
}
