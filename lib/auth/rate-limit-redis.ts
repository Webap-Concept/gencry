// lib/auth/rate-limit-redis.ts
//
// Layer Redis (Upstash REST) per il rate limiting.
// Pattern: INCR + EXPIRE (fixed window) — O(1), sub-millisecond su Upstash.
//
// Chiavi:
//   rl:login:{ip}:{email}   → tentativi login per coppia IP+email
//   rl:email:{email}        → tentativi login per sola email (anti IP-rotation)
//   rl:signup:{ip}          → tentativi signup per IP
//   rl:check:{ip}           → check disponibilità email/username per IP
//   rl:blacklist:{ip}       → flag blacklist IP ("1", no TTL = permanente)
//
// Il layer Redis è always-first: se Redis è down il chiamante fa fallback
// trasparente al DB esistente — nessuna interruzione del servizio.
//
// REFACTOR 2026-05-14: `redisCmd` + `redisPipeline` + `getRedisConfig`
// estratti in lib/kv/raw.ts per riuso cross-module. Questo file re-export
// per backward compat dei call site interni di lib/auth/.

import { redisCmd, redisPipeline, invalidateRedisConfigCache } from "@/lib/kv/raw";
export { redisCmd, redisPipeline, invalidateRedisConfigCache };

// ---------------------------------------------------------------------------
// Key builders
// ---------------------------------------------------------------------------

const KEY_LOGIN     = (ip: string, email: string) => `rl:login:${ip}:${email}`;
const KEY_EMAIL     = (email: string)             => `rl:email:${email}`;
const KEY_SIGNUP    = (ip: string)                => `rl:signup:${ip}`;
const KEY_CHECK     = (ip: string)                => `rl:check:${ip}`;
const KEY_BLACKLIST = (ip: string)                => `rl:blacklist:${ip}`;

// ---------------------------------------------------------------------------
// Tipi
// ---------------------------------------------------------------------------

export type RedisRateLimitResult =
  | { blocked: true;  remaining: 0;      lockoutSeconds: number; source: "redis" }
  | { blocked: false; remaining: number; lockoutSeconds: number; source: "redis" }
  | { source: "unavailable" };

function makeResult(
  blocked: boolean,
  remaining: number,
  lockoutSeconds: number,
): RedisRateLimitResult {
  if (blocked) {
    return { blocked: true, remaining: 0, lockoutSeconds, source: "redis" };
  }
  return { blocked: false, remaining, lockoutSeconds, source: "redis" };
}

// ---------------------------------------------------------------------------
// Blacklist IP
// ---------------------------------------------------------------------------

export async function isIpBlacklistedRedis(ip: string): Promise<boolean | null> {
  try {
    const val = await redisCmd<string | null>(["GET", KEY_BLACKLIST(ip)]);
    return val !== null;
  } catch {
    return null;
  }
}

export async function syncIpBlacklistToRedis(
  ip: string,
  blacklisted: boolean,
): Promise<void> {
  try {
    if (blacklisted) {
      await redisCmd(["SET", KEY_BLACKLIST(ip), "1"]);
    } else {
      await redisCmd(["DEL", KEY_BLACKLIST(ip)]);
    }
  } catch (err) {
    console.error("[rate-limit-redis] syncIpBlacklistToRedis failed:", err);
  }
}

// ---------------------------------------------------------------------------
// Rate limit login (email + IP  +  email globale)
// ---------------------------------------------------------------------------

export async function checkAndIncrLoginRedis(
  email: string,
  ip: string,
  maxAttempts: number,
  windowSeconds: number,
): Promise<RedisRateLimitResult> {
  try {
    const keyPair         = KEY_LOGIN(ip, email);
    const keyEmail        = KEY_EMAIL(email);
    const globalThreshold = maxAttempts * 3;

    const [pairCount, emailCount] = (await redisPipeline([
      ["INCR", keyPair],
      ["INCR", keyEmail],
    ])) as [number, number];

    const ttlCmds: (string | number)[][] = [];
    if (pairCount  === 1) ttlCmds.push(["EXPIRE", keyPair,  windowSeconds]);
    if (emailCount === 1) ttlCmds.push(["EXPIRE", keyEmail, windowSeconds]);
    if (ttlCmds.length > 0) await redisPipeline(ttlCmds);

    const blocked = pairCount >= maxAttempts || emailCount >= globalThreshold;
    const remaining = blocked
      ? 0
      : Math.min(maxAttempts - pairCount, globalThreshold - emailCount);

    return makeResult(blocked, remaining, windowSeconds);
  } catch {
    return { source: "unavailable" };
  }
}

export async function peekLoginRedis(
  email: string,
  ip: string,
  maxAttempts: number,
  windowSeconds: number,
): Promise<RedisRateLimitResult> {
  try {
    const keyPair         = KEY_LOGIN(ip, email);
    const keyEmail        = KEY_EMAIL(email);
    const globalThreshold = maxAttempts * 3;

    const [pairRaw, emailRaw] = (await redisPipeline([
      ["GET", keyPair],
      ["GET", keyEmail],
    ])) as [string | null, string | null];

    const pairCount  = pairRaw  ? parseInt(pairRaw,  10) : 0;
    const emailCount = emailRaw ? parseInt(emailRaw, 10) : 0;

    const blocked = pairCount >= maxAttempts || emailCount >= globalThreshold;
    const remaining = blocked
      ? 0
      : Math.min(maxAttempts - pairCount, globalThreshold - emailCount);

    return makeResult(blocked, remaining, windowSeconds);
  } catch {
    return { source: "unavailable" };
  }
}

export async function unblockIpRedis(ip: string): Promise<void> {
  try {
    let cursor = "0";
    const keysToDelete: string[] = [];

    do {
      const result = (await redisCmd<[string, string[]]>([
        "SCAN", cursor, "MATCH", `rl:login:${ip}:*`, "COUNT", 100,
      ]));
      cursor = result[0];
      keysToDelete.push(...result[1]);
    } while (cursor !== "0");

    keysToDelete.push(KEY_BLACKLIST(ip));

    if (keysToDelete.length > 0) {
      await redisPipeline(keysToDelete.map((k) => ["DEL", k]));
    }
  } catch (err) {
    console.error("[rate-limit-redis] unblockIpRedis failed:", err);
  }
}

// ---------------------------------------------------------------------------
// Rate limit signup per IP
// ---------------------------------------------------------------------------

export async function checkAndIncrSignupRedis(
  ip: string,
  maxAttempts: number,
  windowSeconds: number,
): Promise<RedisRateLimitResult> {
  try {
    const key   = KEY_SIGNUP(ip);
    const count = (await redisCmd<number>(["INCR", key])) as number;
    if (count === 1) await redisCmd(["EXPIRE", key, windowSeconds]);

    const blocked   = count >= maxAttempts;
    const remaining = Math.max(0, maxAttempts - count);

    return makeResult(blocked, remaining, windowSeconds);
  } catch {
    return { source: "unavailable" };
  }
}

// ---------------------------------------------------------------------------
// Rate limit check disponibilità email / username
//
// Usa un contatore dedicato rl:check:{ip} con:
//   - soglia alta (default 30) — l'utente può provare liberamente nel form
//   - finestra breve (default 5 min) — si resetta in fretta
//   - NO recordSignupAttempt: non è un tentativo di registrazione
// ---------------------------------------------------------------------------

export async function checkAndIncrAvailabilityRedis(
  ip: string,
  maxChecks: number,
  windowSeconds: number,
): Promise<RedisRateLimitResult> {
  try {
    const key   = KEY_CHECK(ip);
    const count = (await redisCmd<number>(["INCR", key])) as number;
    if (count === 1) await redisCmd(["EXPIRE", key, windowSeconds]);

    const blocked   = count >= maxChecks;
    const remaining = Math.max(0, maxChecks - count);

    return makeResult(blocked, remaining, windowSeconds);
  } catch {
    // Se Redis è down lasciamo passare — il check Bloom è solo ottimistico
    return { source: "unavailable" };
  }
}
