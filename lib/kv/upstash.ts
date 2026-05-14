// lib/kv/upstash.ts
//
// Helper core per Upstash Redis (KV). Riusabile da tutti i moduli che
// vogliono cache TTL / atomic ops. Restituisce SEMPRE null se Upstash
// non è configurato — i caller hookable degradano a pass-through
// senza throw, così il modulo continua a funzionare anche su deploy
// che non hanno (ancora) un KV abilitato.
//
// Settings di config in app_settings (legacy naming, già presente nel
// codebase pre-2026):
//   - upstash_redis_rest_url
//   - upstash_redis_rest_token
//
// Vedi project_upstash_kv_roadmap per dove e perché stiamo introducendo
// Upstash. I primi consumer sono prices.getCurrentPrices (cache TTL
// `modules.prices.kv_ttl_seconds`) e — quando attivati — i service
// hookable feed-cache / post-cache / rate-limit del modulo posts.
import "server-only";

import { Redis } from "@upstash/redis";
import { getAppSettings } from "@/lib/db/settings-queries";

export interface UpstashConfig {
  restUrl: string;
  restToken: string;
}

export async function loadUpstashConfig(): Promise<UpstashConfig | null> {
  const s = await getAppSettings();
  const restUrl = (s.upstash_redis_rest_url ?? "").trim();
  const restToken = (s.upstash_redis_rest_token ?? "").trim();
  if (!restUrl || !restToken) return null;
  return { restUrl, restToken };
}

export function createUpstashClient(cfg: UpstashConfig): Redis {
  return new Redis({ url: cfg.restUrl, token: cfg.restToken });
}

/**
 * Convenience: client lazy-config. Ritorna null se Upstash non è
 * configurato. Il caller hookable decide se passare al fallback o
 * lanciare un errore esplicito.
 */
export async function getUpstashClient(): Promise<Redis | null> {
  const cfg = await loadUpstashConfig();
  if (!cfg) return null;
  return createUpstashClient(cfg);
}

/**
 * Test di connessione per la pagina admin /services/redis (Test
 * connessione button). Una PING è una chiamata leggera che valida
 * sia URL che token.
 */
export type UpstashConnectionResult =
  | { ok: true; latencyMs: number }
  | {
      ok: false;
      reason: "missing_config" | "forbidden" | "network" | "timeout" | "unknown";
      detail?: string;
    };

export async function checkUpstashConnection(): Promise<UpstashConnectionResult> {
  const cfg = await loadUpstashConfig();
  if (!cfg) return { ok: false, reason: "missing_config" };
  const t0 = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const client = createUpstashClient(cfg);
    // Upstash SDK non espone PING diretta — usiamo un GET su una key
    // tipica "ghost". 401/403 sull'auth se token wrong, 200 OK se
    // url+token validi (anche se la key non esiste).
    await client.get("__upstash_health_check__");
    return { ok: true, latencyMs: Date.now() - t0 };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, reason: "timeout" };
    }
    const message = err instanceof Error ? err.message : String(err);
    if (/401|403|unauth|forbidden/i.test(message)) {
      return { ok: false, reason: "forbidden", detail: message };
    }
    if (/network|fetch failed|ENOTFOUND|ECONNREFUSED/i.test(message)) {
      return { ok: false, reason: "network", detail: message };
    }
    return { ok: false, reason: "unknown", detail: message };
  } finally {
    clearTimeout(timeout);
  }
}
