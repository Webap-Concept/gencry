// lib/modules/prices/config.ts
// Lettura tipizzata della configurazione del modulo prezzi da app_settings.
// Tutti i valori sono memorizzati come stringhe e parsati qui.
// La cache di getAppSettings() vive per il tempo della richiesta (React `cache`),
// quindi ogni esecuzione del cron rilegge i valori freschi.
import { getAppSettings } from "@/lib/db/settings-queries";

export interface PricesR2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl: string;        // senza trailing slash, es. "https://coins.example.com"
}

export interface PricesConfig {
  cronMinutes: number;          // intervallo cron sync prezzi
  universeHours: number;        // finestra "active universe"
  deltaThreshold: number;       // soglia upsert (0..1, es. 0.0005 = 0.05%)
  kvTtlSeconds: number;         // TTL cache KV
  breakerMaxErr: number;        // errori prima di aprire il breaker
  breakerWindowS: number;       // finestra in secondi per il conteggio
  breakerOpenS: number;         // durata apertura breaker
  snapshotMinutes: number;      // intervallo snapshot timeseries
  retentionDays: number;        // retention prices_history
  coingeckoProEnabled: boolean; // se true usa endpoint Pro + header api_key
  coingeckoProApiKey: string | null;
  // R2 storage per coin images. `null` se anche solo una delle 5 chiavi è vuota:
  // il modulo degrada gracefully (URL CoinGecko salvati come fallback).
  r2: PricesR2Config | null;
}

const DEFAULTS: PricesConfig = {
  cronMinutes: 5,
  universeHours: 24,
  deltaThreshold: 0.0005,
  kvTtlSeconds: 30,
  breakerMaxErr: 3,
  breakerWindowS: 300,
  breakerOpenS: 600,
  snapshotMinutes: 5,
  retentionDays: 30,
  coingeckoProEnabled: false,
  coingeckoProApiKey: null,
  r2: null,
};

function parseInt(raw: string | null | undefined, fallback: number, min = 1, max = 100000): number {
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min || n > max) return fallback;
  return Math.trunc(n);
}

function parseFloat01(raw: string | null | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || n >= 1) return fallback;
  return n;
}

export async function getPricesConfig(): Promise<PricesConfig> {
  const s = await getAppSettings();
  return {
    cronMinutes:     parseInt(s["modules.prices.cron_minutes"],     DEFAULTS.cronMinutes,     1, 60),
    universeHours:   parseInt(s["modules.prices.universe_hours"],   DEFAULTS.universeHours,   1, 168),
    deltaThreshold:  parseFloat01(s["modules.prices.delta_threshold"], DEFAULTS.deltaThreshold),
    kvTtlSeconds:    parseInt(s["modules.prices.kv_ttl_seconds"],   DEFAULTS.kvTtlSeconds,    1, 3600),
    breakerMaxErr:   parseInt(s["modules.prices.breaker_max_err"],  DEFAULTS.breakerMaxErr,   1, 100),
    breakerWindowS:  parseInt(s["modules.prices.breaker_window_s"], DEFAULTS.breakerWindowS,  10, 86400),
    breakerOpenS:    parseInt(s["modules.prices.breaker_open_s"],   DEFAULTS.breakerOpenS,    10, 86400),
    snapshotMinutes: parseInt(s["modules.prices.snapshot_minutes"], DEFAULTS.snapshotMinutes, 1, 60),
    retentionDays:   parseInt(s["modules.prices.retention_days"],   DEFAULTS.retentionDays,   1, 365),
    coingeckoProEnabled: (s["modules.prices.coingecko_pro_enabled"] ?? "false") === "true",
    coingeckoProApiKey:  s["modules.prices.coingecko_pro_api_key"] ?? null,
    r2: parseR2Config(s),
  };
}

/**
 * R2 è "configurato" solo se TUTTE le 5 chiavi sono valorizzate non-vuote.
 * Manca una sola → ritorna null e il modulo fa graceful degradation.
 */
function parseR2Config(s: Awaited<ReturnType<typeof getAppSettings>>): PricesR2Config | null {
  const accountId       = (s["modules.prices.r2.account_id"]        ?? "").trim();
  const accessKeyId     = (s["modules.prices.r2.access_key_id"]     ?? "").trim();
  const secretAccessKey = (s["modules.prices.r2.secret_access_key"] ?? "").trim();
  const bucket          = (s["modules.prices.r2.bucket"]            ?? "").trim();
  const publicBaseUrl   = (s["modules.prices.r2.public_base_url"]   ?? "").trim().replace(/\/+$/, "");
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBaseUrl) {
    return null;
  }
  return { accountId, accessKeyId, secretAccessKey, bucket, publicBaseUrl };
}

export const PRICES_DEFAULTS = DEFAULTS;
