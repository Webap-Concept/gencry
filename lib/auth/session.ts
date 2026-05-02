// lib/auth/session.ts
//
// Cookie/JWT layer della sessione. Il JWT contiene SOLO un session-id
// opaco (`sid`); la validazione vera (espirazione, revoca, idle timeout,
// ban/soft-delete dell'utente) avviene server-side via lib/auth/sessions.ts
// che usa cache Redis (TTL 60s) + Postgres come fallback.
//
// Interfaccia esposta: `getSession()`, `setSession(user)`, `createSession(id, role)`,
// `endCurrentSession()`, `signToken`/`verifyToken`, `hashPassword`/`comparePasswords`.
// I primi quattro sono i hooks che il resto della codebase chiama; gli altri due
// gruppi sono helper di basso livello e bcrypt.

import "server-only";
import { NewUser } from "@/lib/db/schema";
import { compare, hash } from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies, headers } from "next/headers";
import {
  createSession as createSessionRow,
  getValidSession,
  revokeSession,
  SESSION_DURATION_DAYS,
} from "@/lib/auth/sessions";
import { getDeviceToken } from "@/lib/auth/trusted-device";

const key = new TextEncoder().encode(process.env.AUTH_SECRET);
const SALT_ROUNDS = 10;

// ---------------------------------------------------------------------------
// Bcrypt
// ---------------------------------------------------------------------------

export async function hashPassword(password: string) {
  return hash(password, SALT_ROUNDS);
}

/**
 * Confronta password in chiaro con l'hash bcrypt salvato.
 * Se hashedPassword è null (utente registrato solo via OAuth, senza password),
 * esegue comunque un compare fittizio per non rivelare lo stato dell'account
 * tramite timing attack, e ritorna false.
 */
export async function comparePasswords(
  plainTextPassword: string,
  hashedPassword: string | null,
) {
  if (hashedPassword === null) {
    await compare(
      plainTextPassword,
      "$2b$12$dummyhashXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    );
    return false;
  }
  return compare(plainTextPassword, hashedPassword);
}

// ---------------------------------------------------------------------------
// JWT (sid opaco)
// ---------------------------------------------------------------------------

/** Payload "minimal" — niente PII, solo riferimento al record sessions. */
export type SessionTokenPayload = {
  sid: string;
};

/**
 * Tipo restituito da getSession verso i consumer (lib/db/queries.ts, layout,
 * ecc.). Manteniamo `user.id` + `role` nella shape per compat con il codice
 * esistente che già consuma queste due proprietà.
 */
export type SessionData = {
  user: { id: string; role: string };
  expires: string;
  sessionId: string;
};

export async function signToken(payload: SessionTokenPayload) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_DAYS}d`)
    .sign(key);
}

export async function verifyToken(input: string): Promise<SessionTokenPayload> {
  const { payload } = await jwtVerify(input, key, {
    algorithms: ["HS256"],
  });
  return payload as unknown as SessionTokenPayload;
}

// ---------------------------------------------------------------------------
// Hooks per il resto della codebase
// ---------------------------------------------------------------------------

/**
 * Legge il cookie session, verifica firma + scadenza JWT, e valida la
 * sessione contro il DB (con cache). Se il cookie manca, è scaduto, è
 * revocato o l'utente è banned/soft-deleted, ritorna null.
 *
 * Robusto a errori: non throwa mai, ritorna null. I caller (`layout.tsx`,
 * `getUser`, ecc.) usano già questo contract.
 */
export async function getSession(): Promise<SessionData | null> {
  const cookie = (await cookies()).get("session")?.value;
  if (!cookie) return null;

  let sid: string;
  try {
    const payload = await verifyToken(cookie);
    sid = payload.sid;
    if (!sid) return null;
  } catch {
    return null;
  }

  const session = await getValidSession(sid);
  if (!session) return null;

  return {
    user: { id: session.userId, role: session.role },
    expires: session.expiresAt.toISOString(),
    sessionId: session.sessionId,
  };
}

/**
 * Crea una nuova sessione server-side e setta il cookie. `userAgent` e
 * `ip` vengono letti dagli headers della request corrente; `deviceToken`
 * dal cookie già esistente.
 */
export async function setSession(user: NewUser) {
  const h = await headers();
  const userAgent = h.get("user-agent") ?? null;
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    null;
  const deviceToken = await getDeviceToken();

  const session = await createSessionRow({
    userId: user.id!,
    role: user.role ?? "member",
    deviceToken,
    userAgent,
    ip,
  });

  const token = await signToken({ sid: session.id });
  (await cookies()).set("session", token, {
    expires: session.expiresAt,
    httpOnly: true,
    secure: true,
    sameSite: "lax",
  });
}

/**
 * Alias usato dai callback OAuth dove non si ha un oggetto NewUser completo.
 */
export async function createSession(userId: string, role: string) {
  return setSession({ id: userId, role } as NewUser);
}

/**
 * Revoca la sessione corrente (DB + cache) e cancella il cookie.
 * Da chiamare in signOut. Se non c'è cookie o JWT è invalido, no-op.
 */
export async function endCurrentSession(): Promise<void> {
  const cookie = (await cookies()).get("session")?.value;
  if (cookie) {
    try {
      const { sid } = await verifyToken(cookie);
      if (sid) await revokeSession(sid);
    } catch {
      // JWT invalid: niente sessionId estraibile, basta rimuovere il cookie.
    }
  }
  (await cookies()).delete("session");
}
