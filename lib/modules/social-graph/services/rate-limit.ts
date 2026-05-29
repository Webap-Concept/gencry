import "server-only";
// lib/modules/social-graph/services/rate-limit.ts
//
// Rate limit per le azioni follow/unfollow del modulo social-graph.
// Sliding window via @upstash/ratelimit. Fail-open su qualsiasi errore
// (Upstash non configurato, network, timeout) → ritorna ok=true.
//
// Default: 30 follow/min per utente (anti-bot, anti-mass-follow). Soglia
// configurabile via settings `modules.social-graph.rate_limit_follow_per_min`.
import { Ratelimit } from "@upstash/ratelimit";
import { getRedisClient } from "@/lib/kv/sdk";
import { getAppSettings } from "@/lib/db/settings-queries";

export type SocialGraphAction = "follow";

export type RateLimitResult = {
  ok: boolean;
  retryAfter?: number;
  limit?: number;
  remaining?: number;
};

const SETTINGS_KEY: Record<SocialGraphAction, string> = {
  follow: "modules.social-graph.rate_limit_follow_per_min",
};

const WINDOW_FOR_ACTION: Record<SocialGraphAction, "1 m" | "1 h"> = {
  follow: "1 m",
};

const DEFAULT_LIMIT: Record<SocialGraphAction, number> = {
  follow: 30,
};

function parseLimit(raw: string | null | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

type ActionConfig = { limit: number; window: "1 m" | "1 h" };

async function loadActionConfig(action: SocialGraphAction): Promise<ActionConfig> {
  const settings = (await getAppSettings()) as Record<string, string | null | undefined>;
  const raw = settings[SETTINGS_KEY[action]];
  return {
    limit: parseLimit(raw, DEFAULT_LIMIT[action]),
    window: WINDOW_FOR_ACTION[action],
  };
}

type Memo = { instance: Ratelimit; expiry: number; config: ActionConfig };
const ratelimitCache = new Map<SocialGraphAction, Memo>();
const MEMO_TTL_MS = 60_000;

async function getRatelimitFor(action: SocialGraphAction): Promise<Ratelimit | null> {
  const now = Date.now();
  const memo = ratelimitCache.get(action);
  if (memo && now < memo.expiry) return memo.instance;

  const client = await getRedisClient();
  if (!client) return null;

  const config = await loadActionConfig(action);

  if (memo && memo.config.limit === config.limit && memo.config.window === config.window) {
    memo.expiry = now + MEMO_TTL_MS;
    return memo.instance;
  }

  const instance = new Ratelimit({
    redis: client,
    limiter: Ratelimit.slidingWindow(config.limit, config.window),
    analytics: true,
    prefix: `social-graph:rl:${action}`,
    ephemeralCache: new Map(),
  });
  ratelimitCache.set(action, { instance, expiry: now + MEMO_TTL_MS, config });
  return instance;
}

/**
 * Check sliding-window per l'azione del modulo social-graph.
 * Fail-open su qualsiasi errore (Upstash non configurato → ok=true).
 */
export async function checkSocialGraphRateLimit(
  userId: string,
  action: SocialGraphAction,
): Promise<RateLimitResult> {
  const ratelimit = await getRatelimitFor(action);
  if (!ratelimit) return { ok: true };

  try {
    const res = await ratelimit.limit(userId);
    if (res.success) {
      return { ok: true, limit: res.limit, remaining: res.remaining };
    }
    const retryAfter = Math.max(1, Math.ceil((res.reset - Date.now()) / 1000));
    console.warn("[social-graph:rl] deny", {
      action,
      userId,
      retryAfter,
      limit: res.limit,
    });
    return { ok: false, retryAfter, limit: res.limit, remaining: 0 };
  } catch (err) {
    console.warn("[social-graph:rl] error — fail-open", {
      action,
      userId,
      err: String(err),
    });
    return { ok: true };
  }
}
