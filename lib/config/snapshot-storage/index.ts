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
 *
 * `accountId` viene dalla chiave GLOBAL `storage.r2.account_id` (account
 * Cloudflare unico). `access_key_id` / `secret_access_key` / `bucket` sono
 * specifici di QUESTO bucket per isolamento di security.
 */
export async function loadSnapshotR2Config(): Promise<ConfigR2Config | null> {
  const s = await fetchAppSettingsRaw();
  const accountId       = (s["storage.r2.account_id"]               ?? "").trim();
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
 * FAST PATH: se lo storage è già cached, ritorniamo subito SENZA toccare
 * il DB. Questo è critico perché `loadSnapshotR2Config` legge da
 * `app_settings` con `fetchAppSettingsRaw` — una query DB. Senza il
 * fast-path, ogni `getAppSettings()` paga 1 query DB anche quando lo
 * snapshot è perfettamente cached → vanifica l'intera architettura.
 *
 * COLD PATH: la prima call dopo cold-start (o dopo
 * `invalidateSnapshotStorageCache`) paga 1 query DB per leggere le
 * credenziali R2, poi cachata per il resto del lifecycle lambda.
 *
 * Tradeoff accettato: se l'admin ruota le credenziali R2 in produzione
 * mentre altre lambda sono warm, quelle continueranno a usare le vecchie
 * credenziali fino al loro restart (~15 min di TTL lambda Vercel). La
 * lambda che ha effettivamente fatto il save invalida la cache via
 * `invalidateSnapshotStorageCache` nel flow di mutation.
 */
let _cachedStorage: SnapshotStorage | null = null;

export async function getSnapshotStorage(): Promise<SnapshotStorage | null> {
  // Fast path: cache hit, NO DB call
  if (_cachedStorage) return _cachedStorage;

  // Cold path: load config from DB once, cache result
  const cfg = await loadSnapshotR2Config();
  if (!cfg) return null;

  const client = createConfigR2Client(cfg);
  _cachedStorage = new R2SnapshotStorage(client, cfg.bucket);
  return _cachedStorage;
}

/**
 * Invalida lo storage cached. Chiamato dalle admin actions che modificano
 * `storage.config.r2.*` o `storage.r2.account_id` per forzare il prossimo
 * factory call a leggere le credenziali fresche.
 */
export function invalidateSnapshotStorageCache(): void {
  _cachedStorage = null;
}
