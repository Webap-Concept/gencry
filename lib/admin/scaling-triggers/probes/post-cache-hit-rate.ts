import "server-only";
// lib/admin/scaling-triggers/probes/post-cache-hit-rate.ts
//
// Probe hit rate del post-cache V2 negli ultimi 7 giorni. Legge i
// counter `posts:cache:metrics:{hits|misses}:YYYY-MM-DD` aggiornati
// fire-and-forget da `lib/modules/posts/services/post-cache.ts`.
//
// Costo: 1 MGET di 14 chiavi (7 giorni × 2 kind). Trascurabile, <2ms.
//
// Hit rate calculation: solo L2 (Upstash) — L1 in-process non è
// contata. È la metrica che conta per il trigger V2.5: se la L2 cala
// sotto 50% significa che le invalidate sono troppo aggressive vs
// il TTL 5min effettivo. V2.5 = write-through partial + transitive
// quote invalidation (vedi project_post_cache_v25_followup).
import { getRedisClient } from "@/lib/kv/sdk";

const METRICS_KEY_PREFIX = "posts:cache:metrics:";

export default async function probePostCacheHitRate(): Promise<{
  value: number | null;
  unit: string;
  formatted?: string;
  error?: string;
}> {
  const client = await getRedisClient();
  if (!client) {
    return { value: null, unit: "%", error: "upstash_not_configured" };
  }

  try {
    const days = lastNDays(7);
    const hitKeys = days.map((d) => `${METRICS_KEY_PREFIX}hits:${d}`);
    const missKeys = days.map((d) => `${METRICS_KEY_PREFIX}misses:${d}`);
    const all = await client.mget<Array<string | number | null>>(
      ...hitKeys,
      ...missKeys,
    );

    let totalHits = 0;
    let totalMisses = 0;
    for (let i = 0; i < days.length; i++) {
      totalHits += parseCounter(all[i]);
      totalMisses += parseCounter(all[i + days.length]);
    }

    const total = totalHits + totalMisses;
    if (total === 0) {
      // Mai chiamato → ancora nessun dato. Trigger neutro (n/d).
      return { value: null, unit: "%", error: "no_data_yet" };
    }
    const rate = (totalHits / total) * 100;
    return {
      value: rate,
      unit: "%",
      formatted: `${rate.toFixed(1)}% (${totalHits.toLocaleString()} hit / ${total.toLocaleString()} req)`,
    };
  } catch (err) {
    return { value: null, unit: "%", error: String(err) };
  }
}

function lastNDays(n: number): string[] {
  const out: string[] = [];
  const today = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function parseCounter(raw: unknown): number {
  if (raw === null || raw === undefined) return 0;
  if (typeof raw === "number") return raw;
  if (typeof raw === "string") {
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}
