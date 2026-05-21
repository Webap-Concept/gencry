// lib/kv/raw.ts
//
// Primitive fetch-raw verso l'Upstash Redis REST API. Neutral, riusabile
// da qualunque modulo. Niente SDK: usiamo fetch nativo per minimizzare
// bundle size e allinearci al pattern preesistente in
// lib/auth/rate-limit-redis.ts (che re-importa da qui).
//
// Config: 1 istanza Upstash per tenant (vedi
// project_upstash_kv_roadmap §"Per-modulo vs globale"). Le credenziali
// stanno in `upstash_redis_rest_url` + `upstash_redis_rest_token` —
// settings globali, NON per-modulo (a differenza di R2 dove i token
// sono scoped al bucket; qui il token = full DB access, isolare per
// modulo non aggiunge security, solo duplicazione).
//
// Pattern di chiamata:
//   const res = await redisCmd<string>(['GET', 'prices:current:all']);
//   await redisPipeline([['SET', k, v, 'EX', 30], ['INCR', counter]]);
//
// Errori: throw su credentials mancanti / network / HTTP non-2xx. Il
// caller hookable (es. prices cache) deve fare try/catch e fallback
// trasparente (DB / pass-through). MAI lasciare che un KV outage
// rompa l'app.
import "server-only";

import { getAppSettings } from "@/lib/db/settings-queries";
import { logRedisCmd, logRedisPipeline } from "./instrumentation";

const REQUEST_TIMEOUT_MS = 2000;

// In-process cache delle credenziali. Si invalida via
// invalidateRedisConfigCache() quando l'admin cambia le settings.
let _cachedConfig: { url: string; token: string } | null = null;
let _cacheExpiry = 0;

export function invalidateRedisConfigCache(): void {
  _cachedConfig = null;
  _cacheExpiry = 0;
}

async function getRedisConfig(): Promise<{ url: string; token: string }> {
  const now = Date.now();
  if (_cachedConfig && now < _cacheExpiry) return _cachedConfig;

  const settings = await getAppSettings();
  const url = settings.upstash_redis_rest_url;
  const token = settings.upstash_redis_rest_token;

  if (!url || !token) {
    throw new Error("[kv/raw] Missing Upstash credentials in app settings");
  }

  _cachedConfig = { url, token };
  _cacheExpiry = now + 60_000;
  return _cachedConfig;
}

/**
 * Verifica veloce se Upstash è configurato (entrambe le credenziali
 * presenti). Utile per hookable services che vogliono early-return su
 * pass-through senza far throw a getRedisConfig.
 */
export async function isUpstashConfigured(): Promise<boolean> {
  const settings = await getAppSettings();
  return Boolean(
    settings.upstash_redis_rest_url && settings.upstash_redis_rest_token,
  );
}

/**
 * Esegui un singolo comando Redis sull'endpoint REST Upstash.
 * Body = JSON array `[CMD, arg1, arg2, ...]`.
 */
export async function redisCmd<T = unknown>(
  command: (string | number)[],
): Promise<T> {
  const { url, token } = await getRedisConfig();
  const t0 = Date.now();
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`[kv/raw] HTTP ${res.status}: ${text}`);
  }
  const json = (await res.json()) as { result: T; error?: string };
  if (json.error) throw new Error(`[kv/raw] ${json.error}`);
  logRedisCmd(command, Date.now() - t0);
  return json.result;
}

/**
 * Batch N comandi in 1 round-trip via l'endpoint /pipeline. Ritorna i
 * risultati nello stesso ordine. Usare ogni volta che si farebbe un
 * loop di redisCmd — il round-trip è il costo dominante a scale.
 */
export async function redisPipeline(
  commands: (string | number)[][],
): Promise<unknown[]> {
  const { url, token } = await getRedisConfig();
  const t0 = Date.now();
  const res = await fetch(`${url}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`[kv/raw] pipeline HTTP ${res.status}: ${text}`);
  }
  const json = (await res.json()) as { result: unknown; error?: string }[];
  logRedisPipeline(commands, Date.now() - t0);
  return json.map((r) => r.result);
}

/**
 * Test di connessione per la pagina admin /services/redis. Esegue una
 * GET su una key sentinel: 200 = url+token validi (anche se la key
 * non esiste); 401/403 = token wrong; network = url wrong.
 */
export type UpstashConnectionResult =
  | { ok: true; latencyMs: number }
  | {
      ok: false;
      reason: "missing_config" | "forbidden" | "network" | "timeout" | "unknown";
      detail?: string;
    };

export async function checkUpstashConnection(): Promise<UpstashConnectionResult> {
  if (!(await isUpstashConfigured())) {
    return { ok: false, reason: "missing_config" };
  }
  const t0 = Date.now();
  try {
    await redisCmd(["GET", "__upstash_health_check__"]);
    return { ok: true, latencyMs: Date.now() - t0 };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/timeout|AbortError/i.test(message)) {
      return { ok: false, reason: "timeout" };
    }
    if (/401|403|unauth|forbidden/i.test(message)) {
      return { ok: false, reason: "forbidden", detail: message };
    }
    if (/network|fetch failed|ENOTFOUND|ECONNREFUSED/i.test(message)) {
      return { ok: false, reason: "network", detail: message };
    }
    return { ok: false, reason: "unknown", detail: message };
  }
}
