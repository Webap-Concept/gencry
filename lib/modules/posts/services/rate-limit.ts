import "server-only";
// lib/modules/posts/services/rate-limit.ts
//
// Service astratto per il rate limiting delle azioni write del modulo
// posts. Hookable: V1 = open (sempre ok), V2 = Upstash sliding window
// via `@upstash/ratelimit`. V2 attivo dal 2026-05-25.
//
// Le soglie sono lette via `modules.posts.rate_limit_*` da app_settings.
// I default coprono uso normale; cambiabili dall'admin senza redeploy.
//
// Behavior:
//   - Per ogni azione l'instance Ratelimit viene istanziata lazy (1 sola
//     volta) con `Ratelimit.slidingWindow(limit, window)` + `ephemeralCache`
//     in-memory (riduce i cmd Redis sui deny ripetuti). La config viene
//     ri-caricata se i settings cambiano (memoization 60s).
//   - Key namespaced `posts:rl:<action>:<userId>` per evitare collisioni
//     cross-modulo.
//   - `analytics: true` → dashboard Upstash mostra hit/miss per azione.
//
// Fail-open semantica:
//   - Upstash non configurato → ritorna ok=true (modulo installabile su
//     Vercel free senza KV).
//   - Errore Redis (timeout, network) → ritorna ok=true + log warn. Un
//     KV outage non deve bloccare l'utilizzo. Fail-closed renderebbe il
//     sito inutilizzabile durante outage Upstash — preferiamo il rischio
//     di abuse in finestra di outage (raro).
//
// Caller (Server Actions di posts) chiamano sempre `checkPostRateLimit()`
// PRIMA della mutation. Se ritorna ok=false, returnare error tipizzato
// `posts.errors.rate_limited` con `retryAfter` per UI countdown.
import { Ratelimit } from "@upstash/ratelimit";
import { getRedisClient } from "@/lib/kv/sdk";
import { getAppSettings } from "@/lib/db/settings-queries";

export type PostAction =
  | "post"
  | "reaction"
  | "comment"
  | "repost"
  | "report"
  | "media";

export type RateLimitResult = {
  /** true = il chiamante può procedere */
  ok: boolean;
  /** secondi prima del prossimo retry, se ok=false */
  retryAfter?: number;
  /** Soglia per la finestra (debug/header info) */
  limit?: number;
  /** Quante richieste sono rimaste nella finestra (debug/header info) */
  remaining?: number;
};

// ─── Config per action ──────────────────────────────────────────────────
//
// `window` è espresso come Duration string di @upstash/ratelimit
// (`"1 m"`, `"1 h"`, ecc.). Mappato dal nome della setting:
//   - rate_limit_<action>_per_min  → window = "1 m"
//   - rate_limit_<action>_per_hour → window = "1 h"
type ActionConfig = {
  limit: number;
  window: "1 m" | "1 h";
};

const SETTINGS_KEY: Record<PostAction, keyof Awaited<ReturnType<typeof getAppSettings>>> = {
  post:     "modules.posts.rate_limit_post_per_hour",
  reaction: "modules.posts.rate_limit_reaction_per_min",
  comment:  "modules.posts.rate_limit_comment_per_min",
  repost:   "modules.posts.rate_limit_repost_per_hour",
  report:   "modules.posts.rate_limit_report_per_hour",
  media:    "modules.posts.rate_limit_media_per_hour",
};

const WINDOW_FOR_ACTION: Record<PostAction, "1 m" | "1 h"> = {
  post:     "1 h",
  reaction: "1 m",
  comment:  "1 m",
  repost:   "1 h",
  report:   "1 h",
  media:    "1 h",
};

const DEFAULT_LIMIT: Record<PostAction, number> = {
  post:     10,
  reaction: 60,
  comment:  30,
  repost:   5,
  report:   5,
  media:    20,
};

function parseLimit(raw: string | null | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

async function loadActionConfig(action: PostAction): Promise<ActionConfig> {
  const settings = await getAppSettings();
  const raw = settings[SETTINGS_KEY[action]];
  return {
    limit: parseLimit(raw, DEFAULT_LIMIT[action]),
    window: WINDOW_FOR_ACTION[action],
  };
}

// ─── Ratelimit instance memoization ─────────────────────────────────────
//
// Una Ratelimit instance per azione, memoizzata 60s (re-instanzia se
// l'admin cambia la soglia). Riusare la stessa instance è importante
// per condividere l'`ephemeralCache` SDK in-memory tra le call.
type Memo = { instance: Ratelimit; expiry: number; config: ActionConfig };
const ratelimitCache = new Map<PostAction, Memo>();
const MEMO_TTL_MS = 60_000;

async function getRatelimitFor(action: PostAction): Promise<Ratelimit | null> {
  const now = Date.now();
  const memo = ratelimitCache.get(action);
  if (memo && now < memo.expiry) return memo.instance;

  const client = await getRedisClient();
  if (!client) return null;

  const config = await loadActionConfig(action);

  // Se config invariata e memo c'è ma scaduta, refresh expiry e riusa.
  if (memo && memo.config.limit === config.limit && memo.config.window === config.window) {
    memo.expiry = now + MEMO_TTL_MS;
    return memo.instance;
  }

  const instance = new Ratelimit({
    redis: client,
    limiter: Ratelimit.slidingWindow(config.limit, config.window),
    analytics: true,
    prefix: `posts:rl:${action}`,
    // ephemeralCache: la SDK skippa Redis quando un utente è già stato
    // denied entro la finestra. Cap 1000 entries per lambda warm.
    ephemeralCache: new Map(),
  });
  ratelimitCache.set(action, {
    instance,
    expiry: now + MEMO_TTL_MS,
    config,
  });
  return instance;
}

/**
 * Check sliding window per l'azione del posts module.
 *
 * Fail-open su qualsiasi errore (Upstash non configurato, network,
 * timeout): ritorna ok=true. Logga warn così il deny rate effettivo è
 * misurabile via `UPSTASH_DEBUG=1` + log [posts:rl].
 *
 * @param userId  utente che esegue l'azione (per scoping della key)
 * @param action  azione tentata (per scegliere la finestra/limit corretta)
 */
export async function checkPostRateLimit(
  userId: string,
  action: PostAction,
): Promise<RateLimitResult> {
  const ratelimit = await getRatelimitFor(action);
  if (!ratelimit) {
    // Upstash non configurato → fail-open
    return { ok: true };
  }

  try {
    const res = await ratelimit.limit(userId);
    if (res.success) {
      return { ok: true, limit: res.limit, remaining: res.remaining };
    }
    const retryAfter = Math.max(1, Math.ceil((res.reset - Date.now()) / 1000));
    console.warn("[posts:rl] deny", { action, userId, retryAfter, limit: res.limit });
    return { ok: false, retryAfter, limit: res.limit, remaining: 0 };
  } catch (err) {
    // Network / timeout → fail-open + log per non degradare l'UX
    console.warn("[posts:rl] error — fail-open", { action, userId, err: String(err) });
    return { ok: true };
  }
}
