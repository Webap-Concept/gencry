// lib/auth/rate-limit.ts
//
// Dual-layer rate limiting:
//   L1 — Redis (Upstash): check in-memory <2ms, nessun carico su DB
//   L2 — DB (Postgres/Drizzle): fallback se Redis non è disponibile
//                                + storage storico per la dashboard admin
//
// Contesti separati:
//   checkRateLimit          → login (bf_signin_max, bf_window_minutes)
//   checkSignupRateLimit    → registrazione (bf_signup_max, bf_window_minutes)
//   checkAvailabilityRateLimit → check email/username nel form (bf_check_max, bf_check_window)

import { db } from "@/lib/db/drizzle";
import { loginAttempts, ipBlacklist } from "@/lib/db/schema";
import { getAppSettings } from "@/lib/db/settings-queries";
import { and, count, eq, gte, lt, desc, sql } from "drizzle-orm";
import {
  evaluateIpForAuth,
  recordIpRuleHit,
} from "./ip-rules";
import {
  checkAndIncrLoginRedis,
  checkAndIncrSignupRedis,
  checkAndIncrAvailabilityRedis,
  peekLoginRedis,
  unblockIpRedis,
} from "./rate-limit-redis";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
async function getBruteforceConfig() {
  try {
    const s = await getAppSettings();
    return {
      // Login
      signinMax:      parseInt(s.bf_signin_max,      10) || 5,
      // Signup
      signupMax:      parseInt(s.bf_signup_max,      10) || 10,
      // Availability check email/username
      checkMax:       parseInt(s.bf_check_max,       10) || 30,
      checkWindow:    parseInt(s.bf_check_window,    10) || 5,
      // Comuni
      windowMinutes:  parseInt(s.bf_window_minutes,  10) || 15,
      lockoutMinutes: parseInt(s.bf_lockout_minutes, 10) || 30,
      alertThreshold: parseInt(s.bf_alert_threshold, 10) || 20,
    };
  } catch {
    return {
      signinMax: 5, signupMax: 10, checkMax: 30, checkWindow: 5,
      windowMinutes: 15, lockoutMinutes: 30, alertThreshold: 20,
    };
  }
}

// ---------------------------------------------------------------------------
// Cleanup DB asincrono — fire-and-forget
// ---------------------------------------------------------------------------
function cleanupOldAttempts(): void {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  void db
    .delete(loginAttempts)
    .where(lt(loginAttempts.attemptedAt, cutoff))
    .catch((err: unknown) => {
      console.error("[cleanupOldAttempts] failed:", err);
    });
}

// ---------------------------------------------------------------------------
// Marker interni DB
// ---------------------------------------------------------------------------
const GENERAL_IP_MARKER       = "__general__";
const SIGNUP_EMAIL_MARKER     = "__signup__";
const PER_EMAIL_ANY_IP_MARKER = "__anyip__";

// `reason` è valorizzato SOLO quando il blocco arriva da una regola IP
// manuale (deny in `ip_rules`). Per il caller serve a scegliere il
// messaggio: "Accesso negato" invece dell'ingannevole "Troppi tentativi,
// riprova tra X minuti" usato per il rate-limit reale.
export type RateLimitBlockReason = "ip-rule";

// ---------------------------------------------------------------------------
// checkRateLimit — login, DUAL LAYER
// ---------------------------------------------------------------------------
export async function checkRateLimit(
  email: string,
  ip: string,
): Promise<{
  blocked: boolean;
  remaining: number;
  lockoutMinutes: number;
  reason?: RateLimitBlockReason;
}> {
  const cfg = await getBruteforceConfig();
  const windowSeconds = cfg.windowMinutes * 60;

  // ── L0: IP rules manuali (in-memory cache, ~µs) ──────────────────────────
  // Allow → bypass totale rate-limit (l'IP è in allowlist amministrativa).
  // Deny  → reject immediato senza toccare Redis/DB. Hit counter f-and-f.
  const ruling = await evaluateIpForAuth(ip);
  if (ruling.decision === "allow") {
    recordIpRuleHit(ruling.ruleId);
    return { blocked: false, remaining: cfg.signinMax, lockoutMinutes: cfg.lockoutMinutes };
  }
  if (ruling.decision === "deny") {
    recordIpRuleHit(ruling.ruleId);
    return {
      blocked: true,
      remaining: 0,
      lockoutMinutes: cfg.lockoutMinutes,
      reason: "ip-rule",
    };
  }

  // ── L1: Redis ────────────────────────────────────────────────────────────
  const peek = await peekLoginRedis(email, ip, cfg.signinMax, windowSeconds);

  if (peek.source === "redis") {
    if (peek.blocked) {
      return { blocked: true, remaining: 0, lockoutMinutes: cfg.lockoutMinutes };
    }
    const incr = await checkAndIncrLoginRedis(email, ip, cfg.signinMax, windowSeconds);
    if (incr.source === "redis") {
      return {
        blocked:        incr.blocked,
        remaining:      incr.remaining,
        lockoutMinutes: cfg.lockoutMinutes,
      };
    }
  }

  // ── L2: DB fallback ──────────────────────────────────────────────────────
  cleanupOldAttempts();
  const windowStart = new Date(Date.now() - windowSeconds * 1000);

  const [blacklisted] = await db
    .select({ id: ipBlacklist.id })
    .from(ipBlacklist)
    .where(eq(ipBlacklist.ip, ip))
    .limit(1);
  if (blacklisted) return { blocked: true, remaining: 0, lockoutMinutes: cfg.lockoutMinutes };

  const [resultByEmailIp] = await db
    .select({ total: count() })
    .from(loginAttempts)
    .where(and(
      eq(loginAttempts.email, email),
      eq(loginAttempts.ip, ip),
      gte(loginAttempts.attemptedAt, windowStart),
      eq(loginAttempts.success, false),
    ));

  const totalByEmailIp = resultByEmailIp?.total ?? 0;
  if (totalByEmailIp >= cfg.signinMax) {
    return { blocked: true, remaining: 0, lockoutMinutes: cfg.lockoutMinutes };
  }

  const globalEmailThreshold = cfg.signinMax * 3;
  const [resultByEmail] = await db
    .select({ total: count() })
    .from(loginAttempts)
    .where(and(
      eq(loginAttempts.email, email),
      gte(loginAttempts.attemptedAt, windowStart),
      eq(loginAttempts.success, false),
      sql`${loginAttempts.ip} NOT IN (${GENERAL_IP_MARKER}, ${PER_EMAIL_ANY_IP_MARKER})`,
    ));

  const totalByEmail = resultByEmail?.total ?? 0;
  const remaining = Math.max(
    0,
    Math.min(cfg.signinMax - totalByEmailIp, globalEmailThreshold - totalByEmail),
  );

  return {
    blocked:        totalByEmail >= globalEmailThreshold,
    remaining,
    lockoutMinutes: cfg.lockoutMinutes,
  };
}

export async function recordLoginAttempt(
  email: string,
  ip: string,
  success: boolean,
): Promise<void> {
  await db.insert(loginAttempts).values({ email, ip, success });
}

// ---------------------------------------------------------------------------
// checkSignupRateLimit — registrazione, DUAL LAYER
// ---------------------------------------------------------------------------
export async function checkSignupRateLimit(
  ip: string,
): Promise<{
  blocked: boolean;
  remaining: number;
  reason?: RateLimitBlockReason;
}> {
  const cfg = await getBruteforceConfig();
  const windowSeconds = cfg.windowMinutes * 60;

  // ── L0: IP rules manuali (vedi commento in checkRateLimit) ───────────────
  const ruling = await evaluateIpForAuth(ip);
  if (ruling.decision === "allow") {
    recordIpRuleHit(ruling.ruleId);
    return { blocked: false, remaining: cfg.signupMax };
  }
  if (ruling.decision === "deny") {
    recordIpRuleHit(ruling.ruleId);
    return { blocked: true, remaining: 0, reason: "ip-rule" };
  }

  // ── L1: Redis ────────────────────────────────────────────────────────────
  const result = await checkAndIncrSignupRedis(ip, cfg.signupMax, windowSeconds);
  if (result.source === "redis") {
    return { blocked: result.blocked, remaining: result.remaining };
  }

  // ── L2: DB fallback ──────────────────────────────────────────────────────
  cleanupOldAttempts();
  const windowStart = new Date(Date.now() - windowSeconds * 1000);

  const [blacklisted] = await db
    .select({ id: ipBlacklist.id })
    .from(ipBlacklist)
    .where(eq(ipBlacklist.ip, ip))
    .limit(1);
  if (blacklisted) return { blocked: true, remaining: 0 };

  const [result2] = await db
    .select({ total: count() })
    .from(loginAttempts)
    .where(and(
      eq(loginAttempts.ip, ip),
      eq(loginAttempts.email, SIGNUP_EMAIL_MARKER),
      gte(loginAttempts.attemptedAt, windowStart),
      eq(loginAttempts.success, false),
    ));

  const total = result2?.total ?? 0;
  return {
    blocked:   total >= cfg.signupMax,
    remaining: Math.max(0, cfg.signupMax - total),
  };
}

export async function recordSignupAttempt(ip: string): Promise<void> {
  await db
    .insert(loginAttempts)
    .values({ email: SIGNUP_EMAIL_MARKER, ip, success: false });
}

// ---------------------------------------------------------------------------
// checkAvailabilityRateLimit — check email/username nel form di registrazione
//
// Contatore separato, soglia alta (default 30), finestra breve (default 5min).
// NON usa recordSignupAttempt: controllare la disponibilità non è un
// tentativo di registrazione e non deve penalizzare l'utente reale.
// ---------------------------------------------------------------------------
export async function checkAvailabilityRateLimit(
  ip: string,
): Promise<{
  blocked: boolean;
  remaining: number;
  reason?: RateLimitBlockReason;
}> {
  const cfg = await getBruteforceConfig();
  const windowSeconds = cfg.checkWindow * 60;

  // ── L0: IP rules manuali (vedi commento in checkRateLimit) ───────────────
  const ruling = await evaluateIpForAuth(ip);
  if (ruling.decision === "allow") {
    recordIpRuleHit(ruling.ruleId);
    return { blocked: false, remaining: cfg.checkMax };
  }
  if (ruling.decision === "deny") {
    recordIpRuleHit(ruling.ruleId);
    return { blocked: true, remaining: 0, reason: "ip-rule" };
  }

  // Solo L1 Redis — se Redis è down lasciamo passare (degradazione graceful)
  const result = await checkAndIncrAvailabilityRedis(ip, cfg.checkMax, windowSeconds);
  if (result.source === "redis") {
    return { blocked: result.blocked, remaining: result.remaining };
  }

  // Redis unavailable → allow (il Bloom è già una protezione sufficiente)
  return { blocked: false, remaining: cfg.checkMax };
}

// ---------------------------------------------------------------------------
// checkGeneralRateLimit — rate limit generico (invariato)
// ---------------------------------------------------------------------------
export async function checkGeneralRateLimit(
  key: string,
  maxAttempts: number,
  windowSeconds: number,
): Promise<{ blocked: boolean; remaining: number }> {
  cleanupOldAttempts();
  const windowStart = new Date(Date.now() - windowSeconds * 1000);

  const [result] = await db
    .select({ total: count() })
    .from(loginAttempts)
    .where(and(
      eq(loginAttempts.email, key),
      eq(loginAttempts.ip, GENERAL_IP_MARKER),
      gte(loginAttempts.attemptedAt, windowStart),
      eq(loginAttempts.success, false),
    ));

  const total = result?.total ?? 0;
  return {
    blocked:   total >= maxAttempts,
    remaining: Math.max(0, maxAttempts - total),
  };
}

export async function recordGeneralAttempt(key: string): Promise<void> {
  await db
    .insert(loginAttempts)
    .values({ email: key, ip: GENERAL_IP_MARKER, success: false });
}

// ---------------------------------------------------------------------------
// Queries admin — dashboard bruteforce
// ---------------------------------------------------------------------------

export type BruteforceEntry = {
  ip: string;
  email: string;
  attempts: number;
  lastAttempt: Date;
  isBlacklisted: boolean;
};

export async function getTopOffenders(limit = 50): Promise<BruteforceEntry[]> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      ip:          loginAttempts.ip,
      email:       loginAttempts.email,
      attempts:    count(),
      lastAttempt: sql<Date>`max(${loginAttempts.attemptedAt})`,
    })
    .from(loginAttempts)
    .where(and(
      gte(loginAttempts.attemptedAt, cutoff),
      eq(loginAttempts.success, false),
    ))
    .groupBy(loginAttempts.ip, loginAttempts.email)
    .orderBy(desc(sql`count(*)`))    
    .limit(limit);

  const blacklist = await db.select({ ip: ipBlacklist.ip }).from(ipBlacklist);
  const blacklistedIps = new Set(blacklist.map((r) => r.ip));

  const internalMarkers = new Set([
    GENERAL_IP_MARKER,
    SIGNUP_EMAIL_MARKER,
    PER_EMAIL_ANY_IP_MARKER,
  ]);

  return rows
    .filter((r) => r.ip !== GENERAL_IP_MARKER && !internalMarkers.has(r.email))
    .map((r) => ({
      ip:            r.ip,
      email:         r.email,
      attempts:      r.attempts,
      lastAttempt:   r.lastAttempt,
      isBlacklisted: blacklistedIps.has(r.ip),
    }));
}

export async function unblockIp(ip: string): Promise<void> {
  void unblockIpRedis(ip).catch((err: unknown) => {
    console.error("[unblockIp] Redis unblock failed:", err);
  });
  await db
    .delete(loginAttempts)
    .where(and(
      eq(loginAttempts.ip, ip),
      eq(loginAttempts.success, false),
    ));
}

export async function blacklistIp(ip: string, reason?: string): Promise<void> {
  await db
    .insert(ipBlacklist)
    .values({ ip, reason: reason ?? null })
    .onConflictDoNothing();
}

export async function removeFromBlacklist(ip: string): Promise<void> {
  await db.delete(ipBlacklist).where(eq(ipBlacklist.ip, ip));
}

export async function getBlacklist() {
  return db.select().from(ipBlacklist).orderBy(desc(ipBlacklist.createdAt));
}
