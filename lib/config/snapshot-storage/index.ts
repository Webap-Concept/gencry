// lib/config/snapshot-storage/index.ts
//
// Factory che ritorna l'istanza SnapshotStorage corretta in base alla config
// in app_settings. La config R2 vive sotto `storage.config.r2.*` — admin la
// imposta in /admin/services/cloudflare (card "Config snapshot R2").
//
// IMPORTANTE: questo factory NON deve dipendere da `getAppSettings()` cached
// (sarebbe ricorsione: getAppSettings → snapshot → factory → getAppSettings).
// Legge la config sempre DIRETTAMENTE dal DB via `fetchAppSettingsRaw()`.

import "server-only";

import type { SnapshotStorage } from "./types";
import {
  R2SnapshotStorage,
  createConfigR2Client,
  type ConfigR2Config,
} from "./r2";
import { fetchAppSettingsRaw } from "@/lib/db/settings-queries";

export type { SnapshotStorage } from "./types";
export { SnapshotStorageError } from "./types";

/**
 * Legge la config R2 dedicata snapshot direttamente dal DB.
 * Ritorna null se anche solo una delle 4 chiavi è vuota — il caller decide
 * il fallback (di solito: lettura diretta DB, comportamento legacy).
 */
export async function loadSnapshotR2Config(): Promise<ConfigR2Config | null> {
  const s = await fetchAppSettingsRaw();
  const accountId       = (s["storage.config.r2.account_id"]        ?? "").trim();
  const accessKeyId     = (s["storage.config.r2.access_key_id"]     ?? "").trim();
  const secretAccessKey = (s["storage.config.r2.secret_access_key"] ?? "").trim();
  const bucket          = (s["storage.config.r2.bucket"]            ?? "").trim();
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    return null;
  }
  return { accountId, accessKeyId, secretAccessKey, bucket };
}

/**
 * Costruisce e ritorna lo storage attivo. Null se R2 non configurato — il
 * caller fallback a read DB (backward compat).
 *
 * Cache il client S3 a livello di modulo: re-istanziarlo per ogni request
 * non serve, e il S3Client tiene un pool di TCP connections interno.
 */
let _cachedStorage: SnapshotStorage | null = null;
let _cachedConfigKey: string | null = null;

export async function getSnapshotStorage(): Promise<SnapshotStorage | null> {
  const cfg = await loadSnapshotR2Config();
  if (!cfg) {
    // Invalidate eventuale storage precedente se la config è stata rimossa
    _cachedStorage = null;
    _cachedConfigKey = null;
    return null;
  }
  // Cache key: se cambiano credenziali (rotation admin), re-istanziare
  const configKey = `${cfg.accountId}/${cfg.bucket}/${cfg.accessKeyId}`;
  if (_cachedStorage && _cachedConfigKey === configKey) {
    return _cachedStorage;
  }
  const client = createConfigR2Client(cfg);
  _cachedStorage = new R2SnapshotStorage(client, cfg.bucket);
  _cachedConfigKey = configKey;
  return _cachedStorage;
}

/**
 * Invalida lo storage cached. Chiamato dalle admin actions che modificano
 * `storage.config.r2.*` per forzare il prossimo factory call a leggere
 * le credenziali fresche.
 */
export function invalidateSnapshotStorageCache(): void {
  _cachedStorage = null;
  _cachedConfigKey = null;
}
