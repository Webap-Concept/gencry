import { db } from "@/lib/db/drizzle";
import { userProfiles, users } from "@/lib/db/schema";
import { getAppSettings } from "@/lib/db/settings-queries";
import { eq } from "drizzle-orm";
import type { BloomEmailCheckResult } from "./types";

// ─── Bloom filter config ───────────────────────────────────────────────────
// m = number of bits, k = number of hash functions
// m=200_000 + k=7 → ~1% false positive rate for up to 20_000 emails
// Formula: m = -n*ln(p) / (ln2)^2  |  k = m/n * ln2
const BLOOM_KEY_EMAILS = "bloom:emails";
const BLOOM_KEY_USERNAMES = "bloom:usernames";
const BLOOM_M = 200_000; // bit array size
const BLOOM_K = 7; // number of hash functions

// ─── Redis config singleton ────────────────────────────────────────────────
// [FIX 1] Cache delle credenziali Redis in memoria di modulo.
// Evita una query DB a getAppSettings() ad ogni singola chiamata a
// redisPipeline / redisCommand, eliminando 300-600ms di latenza accumulata
// per ogni registrazione (la cache vive per tutta la durata del processo warm).
type RedisConfig = { url: string; token: string };
let _redisConfigCache: RedisConfig | null = null;

async function getRedisConfig(): Promise<RedisConfig> {
  if (_redisConfigCache) return _redisConfigCache;

  const settings = await getAppSettings();
  const url = settings.upstash_redis_rest_url;
  const token = settings.upstash_redis_rest_token;

  if (!url || !token) {
    throw new Error(
      "Missing Upstash Redis credentials. Configure them in Admin → Redis or set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in .env",
    );
  }

  _redisConfigCache = { url, token };
  return _redisConfigCache;
}

/**
 * Invalida la cache delle credenziali Redis.
 * Chiamare dopo aver aggiornato url/token nel pannello admin,
 * così la prossima richiesta rileggerà le credenziali dal DB.
 */
export function invalidateRedisConfigCache(): void {
  _redisConfigCache = null;
}

// ─── Redis REST client ────────────────────────────────────────────────────
// Timeout fisso a 2s: se Upstash rallenta o non risponde, abort → il chiamante
// fa fallback al DB invece di tenere appesa la richiesta per ~40s (default
// fetch su Node senza signal). Stessa policy di rate-limit-redis.ts.
const REDIS_TIMEOUT_MS = 2000;

async function redisCommand<T = unknown>(
  command: (string | number)[],
): Promise<T> {
  const { url, token } = await getRedisConfig();
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    signal: AbortSignal.timeout(REDIS_TIMEOUT_MS),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upstash REST error ${res.status}: ${text}`);
  }
  const json = (await res.json()) as { result: T; error?: string };
  if (json.error) throw new Error(json.error);
  return json.result;
}

async function redisPipeline(
  commands: (string | number)[][],
): Promise<unknown[]> {
  // [FIX 1] getRedisConfig() usa la cache in memoria → nessuna query DB extra
  const { url, token } = await getRedisConfig();
  const res = await fetch(`${url}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
    signal: AbortSignal.timeout(REDIS_TIMEOUT_MS),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upstash pipeline error ${res.status}: ${text}`);
  }
  const json = (await res.json()) as { result: unknown; error?: string }[];
  return json.map((r) => r.result);
}

// ─── Hash functions ───────────────────────────────────────────────────────
// Two independent hash functions (h1, h2) combined as h(i) = h1 + i*h2
// (Kirsch-Mitzenmacher technique — gives k independent hashes cheaply)
function hashEmail(email: string, seed: number): number {
  let h = seed;
  for (let i = 0; i < email.length; i++) {
    h = Math.imul(h ^ email.charCodeAt(i), 0x9e3779b9);
    h ^= h >>> 16;
  }
  return Math.abs(h);
}

function getBitPositions(value: string): number[] {
  const h1 = hashEmail(value, 0x811c9dc5);
  const h2 = hashEmail(value, 0xc4ceb9fe);
  const positions: number[] = [];
  for (let i = 0; i < BLOOM_K; i++) {
    positions.push((h1 + i * h2) % BLOOM_M);
  }
  return positions;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// ─── In-process result cache ──────────────────────────────────────────────
//
// Cache locale del RISULTATO finale di checkEmailAvailability /
// checkUsernameAvailability. Skip sia i 7 GETBIT che l'eventuale SQL
// confirm in caso di hit. TTL 60s: copre la finestra "typing del form
// signup ripete lo stesso valore N volte". Invalidazione write-through
// in addEmail/addUsername quando un signup completa.
//
// Vedi feedback_redis_consumer_optimization_pattern.md per il razionale.
//
// Tradeoff staleness: max 60s di drift sulla disponibilità — utente A
// vede "available", B registra subito dopo → A al submit riceve errore.
// Cache lambda-local (non broadcast) → drift dipende da orchestrazione
// Vercel. signupAction fa comunque il check finale dentro la
// transaction, quindi è solo UX, niente data corruption.
const CHECK_CACHE_TTL_MS = 60 * 1000;
const emailCheckCache = new Map<
  string,
  { result: BloomEmailCheckResult; expiry: number }
>();
const usernameCheckCache = new Map<
  string,
  { result: BloomEmailCheckResult; expiry: number }
>();

/**
 * Svuota le cache locali dei check email/username. Usato dai test per
 * isolare le assertion tra `beforeEach` (la cache process-wide riterrebbe
 * i risultati tra test contigui che usano gli stessi input). NON chiamare
 * in production: la cache è il punto del fix di oggi.
 */
export function invalidateBloomCheckCache(): void {
  emailCheckCache.clear();
  usernameCheckCache.clear();
}

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * No-op — kept for API compatibility with seed script and actions.
 * With SETBIT/GETBIT the key is created automatically on first write.
 */
export async function ensureBloomFilter(): Promise<void> {
  // SETBIT auto-creates the key — nothing to do here
}

/**
 * Adds an email to the Bloom filter.
 * Fires k SETBIT commands in a single pipeline.
 */
export async function addEmailToBloom(email: string): Promise<void> {
  const normalized = normalizeEmail(email);
  const positions = getBitPositions(normalized);
  const commands = positions.map((pos) => ["SETBIT", BLOOM_KEY_EMAILS, pos, 1]);
  await redisPipeline(commands);
  // Write-through invalidation: il prossimo check su questa email vede
  // subito "taken" (a parte i lambda warm altri, che vedranno entro TTL).
  emailCheckCache.delete(normalized);
}

/**
 * Adds multiple emails at once using pipelined SETBIT.
 * Batches to avoid oversized payloads.
 */
export async function addEmailsBulkToBloom(emails: string[]): Promise<void> {
  if (emails.length === 0) return;
  const PIPE_BATCH = 200;
  const commands: (string | number)[][] = [];
  for (const email of emails) {
    const normalized = normalizeEmail(email);
    const positions = getBitPositions(normalized);
    for (const pos of positions) {
      commands.push(["SETBIT", BLOOM_KEY_EMAILS, pos, 1]);
    }
    if (commands.length >= PIPE_BATCH * BLOOM_K) {
      await redisPipeline(commands.splice(0, commands.length));
    }
  }
  if (commands.length > 0) {
    await redisPipeline(commands);
  }
  // Bulk re-seed (es. setup script) → cache completa è potenzialmente
  // stale, più semplice clearare tutto che invalidare 1-per-1.
  emailCheckCache.clear();
}

/**
 * Checks if an email is possibly registered.
 *
 * Flow:
 * 1. k GETBIT commands via pipeline (O(k), sub-millisecond on Redis side)
 * 2. If ALL bits = 1 → possibly present → confirm via DB (eliminate false positives)
 * 3. If ANY bit = 0 → certainly absent → skip DB
 *
 * [FIX 1] getRedisConfig() usa la cache → nessuna query DB per le credenziali
 */
export async function checkEmailAvailability(
  email: string,
): Promise<BloomEmailCheckResult> {
  const normalized = normalizeEmail(email);

  // In-process result cache: hit = 0 Redis cmd + 0 SQL.
  const now = Date.now();
  const cached = emailCheckCache.get(normalized);
  if (cached && now < cached.expiry) {
    return cached.result;
  }

  try {
    const positions = getBitPositions(normalized);
    const commands = positions.map((pos) => ["GETBIT", BLOOM_KEY_EMAILS, pos]);
    const results = (await redisPipeline(commands)) as number[];
    const possiblyPresent = results.every((bit) => bit === 1);

    if (!possiblyPresent) {
      const result: BloomEmailCheckResult = { available: true, checkedViaDb: false };
      emailCheckCache.set(normalized, { result, expiry: now + CHECK_CACHE_TTL_MS });
      return result;
    }

    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, normalized))
      .limit(1);

    const result: BloomEmailCheckResult = {
      available: existing.length === 0,
      checkedViaDb: true,
    };
    emailCheckCache.set(normalized, { result, expiry: now + CHECK_CACHE_TTL_MS });
    return result;
  } catch (err) {
    // Redis non raggiungibile → fallback diretto al DB. NON cachiamo qui:
    // se Redis riprende, vogliamo ri-popolare la cache dal path normale.
    console.error("[bloom] Redis unavailable, falling back to DB:", err);
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, normalized))
      .limit(1);

    return { available: existing.length === 0, checkedViaDb: true };
  }
}

// ─── API PER USERNAME ───────────────────────────────────────────────────────

export async function addUsernameToBloom(username: string): Promise<void> {
  const normalized = username.trim().toLowerCase();
  const positions = getBitPositions(normalized);
  const commands = positions.map((pos) => [
    "SETBIT",
    BLOOM_KEY_USERNAMES,
    pos,
    1,
  ]);
  await redisPipeline(commands);
  // Write-through invalidation: il prossimo check vede subito "taken".
  usernameCheckCache.delete(normalized);
}

export async function checkUsernameAvailability(
  username: string,
): Promise<BloomEmailCheckResult> {
  const normalized = username.trim().toLowerCase();

  // In-process result cache: hit = 0 Redis cmd + 0 SQL.
  const now = Date.now();
  const cached = usernameCheckCache.get(normalized);
  if (cached && now < cached.expiry) {
    return cached.result;
  }

  try {
    const positions = getBitPositions(normalized);
    const commands = positions.map((pos) => [
      "GETBIT",
      BLOOM_KEY_USERNAMES,
      pos,
    ]);
    const results = (await redisPipeline(commands)) as number[];
    const possiblyPresent = results.every((bit) => bit === 1);

    if (!possiblyPresent) {
      const result: BloomEmailCheckResult = { available: true, checkedViaDb: false };
      usernameCheckCache.set(normalized, { result, expiry: now + CHECK_CACHE_TTL_MS });
      return result;
    }

    const existing = await db
      .select({ id: userProfiles.id })
      .from(userProfiles)
      .where(eq(userProfiles.username, normalized))
      .limit(1);

    const result: BloomEmailCheckResult = {
      available: existing.length === 0,
      checkedViaDb: true,
    };
    usernameCheckCache.set(normalized, { result, expiry: now + CHECK_CACHE_TTL_MS });
    return result;
  } catch (err) {
    console.error("[bloom] Redis unavailable, falling back to DB:", err);
    const existing = await db
      .select({ id: userProfiles.id })
      .from(userProfiles)
      .where(eq(userProfiles.username, normalized))
      .limit(1);

    return { available: existing.length === 0, checkedViaDb: true };
  }
}
