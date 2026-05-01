// lib/prices/config.ts
// Lettura tipizzata della configurazione del modulo prezzi da app_settings.
// Tutti i valori sono memorizzati come stringhe e parsati qui.
// La cache di getAppSettings() vive per il tempo della richiesta (React `cache`),
// quindi ogni esecuzione del cron rilegge i valori freschi.
import { getAppSettings } from "@/lib/db/settings-queries";

export interface PricesConfig {
  cronMinutes: number;       // intervallo cron sync prezzi
  universeHours: number;     // finestra "active universe"
  deltaThreshold: number;    // soglia upsert (0..1, es. 0.0005 = 0.05%)
  kvTtlSeconds: number;      // TTL cache KV
  breakerMaxErr: number;     // errori prima di aprire il breaker
  breakerWindowS: number;    // finestra in secondi per il conteggio
  breakerOpenS: number;      // durata apertura breaker
  snapshotMinutes: number;   // intervallo snapshot timeseries
  retentionDays: number;     // retention coin_prices
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
    cronMinutes:     parseInt(s.prices_cron_minutes,     DEFAULTS.cronMinutes,     1, 60),
    universeHours:   parseInt(s.prices_universe_hours,   DEFAULTS.universeHours,   1, 168),
    deltaThreshold:  parseFloat01(s.prices_delta_threshold, DEFAULTS.deltaThreshold),
    kvTtlSeconds:    parseInt(s.prices_kv_ttl_seconds,   DEFAULTS.kvTtlSeconds,    1, 3600),
    breakerMaxErr:   parseInt(s.prices_breaker_max_err,  DEFAULTS.breakerMaxErr,   1, 100),
    breakerWindowS:  parseInt(s.prices_breaker_window_s, DEFAULTS.breakerWindowS,  10, 86400),
    breakerOpenS:    parseInt(s.prices_breaker_open_s,   DEFAULTS.breakerOpenS,    10, 86400),
    snapshotMinutes: parseInt(s.prices_snapshot_minutes, DEFAULTS.snapshotMinutes, 1, 60),
    retentionDays:   parseInt(s.prices_retention_days,   DEFAULTS.retentionDays,   1, 365),
  };
}

export const PRICES_DEFAULTS = DEFAULTS;
