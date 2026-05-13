// lib/config/snapshots/app-settings.ts
//
// Snapshot layer per app_settings. Pattern:
//   - Sorgente di verità = DB (admin save aggiorna sempre lì)
//   - Snapshot file in R2 = oggetto AppSettings serializzato JSON
//   - Runtime legge SOLO dallo snapshot (mai DB) tranne nel caso di:
//       1. R2 non configurato → fallback DB silently
//       2. Snapshot non esiste (primo run) → fallback DB + scrivi snapshot
//       3. R2 down a runtime → fallback DB + log error
//
// Hot path: in-memory cache + ETag check ogni ETAG_INTERVAL_MS. La call al
// HEAD R2 paga 1-2ms (R2 CDN edge), trascurabile vs query DB (50-200ms).

import "server-only";

import {
  fetchAppSettingsRaw,
  type AppSettings,
} from "@/lib/db/settings-queries";
import {
  getSnapshotStorage,
  SnapshotStorageError,
} from "@/lib/config/snapshot-storage";

const SNAPSHOT_KEY = "app-settings.json";

// Frequenza massima del HEAD check (ETag verification). Sotto questa soglia
// si serve sempre dalla cache locale senza toccare R2. Sopra, una HEAD viene
// fatta per validare. Tradeoff:
//   - Bassa (es. 5s) → propagazione veloce di cambi cross-instance, più I/O
//   - Alta (es. 5min) → meno I/O, ma admin save può rimanere invisibile su
//     altre lambda fino allo scadere
// 30s è il sweet spot: admin save propagato entro mezzo minuto.
const ETAG_CHECK_INTERVAL_MS = 30_000;

type CacheEntry = {
  data: AppSettings;
  etag: string;
  lastEtagCheckAt: number;
};

let _cache: CacheEntry | null = null;

/**
 * Read app settings dallo snapshot. Hot path: chiamato da `getAppSettings`
 * (che è cached via React `cache()` per request, e questo è l'ultimo layer
 * cross-request).
 *
 * Fallback chain:
 *   1. R2 non configurato → throw SnapshotUnavailableError
 *   2. Snapshot not found → bootstrap: leggi DB, write, ritorna
 *   3. R2 read error → throw SnapshotStorageError (caller fa fallback DB)
 */
export async function readAppSettingsSnapshot(): Promise<AppSettings> {
  const storage = await getSnapshotStorage();
  if (!storage) {
    throw new SnapshotUnavailableError();
  }

  const now = Date.now();

  // Hot path: cache valida e ETag check recente
  if (_cache && now - _cache.lastEtagCheckAt < ETAG_CHECK_INTERVAL_MS) {
    return _cache.data;
  }

  // Cache esiste ma ETag check scaduto: HEAD per validare
  if (_cache) {
    try {
      const head = await storage.head(SNAPSHOT_KEY);
      if (head && head.etag === _cache.etag) {
        // ETag invariato: cache è ancora fresca
        _cache.lastEtagCheckAt = now;
        return _cache.data;
      }
      // ETag diverso o file sparito → cade nella refetch sotto
    } catch (err) {
      // HEAD fallita ma cache è ancora "calda": meglio servire data
      // potenzialmente stale piuttosto che errore al caller. Logghiamo e
      // resettiamo il timer per ritentare al prossimo intervallo.
      // eslint-disable-next-line no-console
      console.warn("[snapshot/app-settings] head check failed, serving cached", err);
      _cache.lastEtagCheckAt = now;
      return _cache.data;
    }
  }

  // No cache o ETag mismatch: full read
  const fresh = await storage.read<AppSettings>(SNAPSHOT_KEY);
  if (fresh) {
    _cache = {
      data: fresh.data,
      etag: fresh.etag,
      lastEtagCheckAt: now,
    };
    return fresh.data;
  }

  // Snapshot non esiste → bootstrap: leggi da DB e scrivi il primo file
  // eslint-disable-next-line no-console
  console.info("[snapshot/app-settings] bootstrap — writing first snapshot from DB");
  const dbData = await fetchAppSettingsRaw();
  try {
    const written = await storage.write(SNAPSHOT_KEY, dbData);
    _cache = {
      data: dbData,
      etag: written.etag,
      lastEtagCheckAt: now,
    };
  } catch (err) {
    // Bootstrap write failed: serviamo i dati DB ma NON cachare (la prossima
    // chiamata ritenterà il bootstrap)
    // eslint-disable-next-line no-console
    console.error("[snapshot/app-settings] bootstrap write failed", err);
  }
  return dbData;
}

/**
 * Forza il sync del snapshot leggendo fresh dal DB e sovrascrivendo il file
 * R2. Chiamato dalle admin actions dopo ogni mutation di `app_settings`.
 *
 * Pattern: **await** (sync mode). L'admin aspetta che lo snapshot sia
 * propagato prima di vedere "saved". Più lento (~200-500ms extra) ma
 * elimina inconsistency window con altre lambda.
 */
export async function syncAppSettingsSnapshot(): Promise<void> {
  const storage = await getSnapshotStorage();
  if (!storage) {
    // R2 non configurato: nessun sync, ma non è un errore — il caller
    // continua a leggere da DB direttamente.
    return;
  }
  const data = await fetchAppSettingsRaw();
  const written = await storage.write(SNAPSHOT_KEY, data);
  // Aggiorna cache locale per la lambda che ha appena salvato. Altre lambda
  // vedranno il cambio al prossimo ETag check (max ETAG_CHECK_INTERVAL_MS).
  _cache = {
    data,
    etag: written.etag,
    lastEtagCheckAt: Date.now(),
  };
}

/**
 * Health check per il widget admin. Non throwa: ritorna stato strutturato.
 */
export type SnapshotHealth =
  | { status: "disabled"; reason: "r2-not-configured" }
  | { status: "ok"; etag: string; sizeBytes: number; lastSyncedAt: Date | null }
  | { status: "missing"; message: "snapshot file does not exist yet" }
  | { status: "error"; message: string };

export async function getAppSettingsSnapshotHealth(): Promise<SnapshotHealth> {
  try {
    const storage = await getSnapshotStorage();
    if (!storage) {
      return { status: "disabled", reason: "r2-not-configured" };
    }
    const result = await storage.read<AppSettings>(SNAPSHOT_KEY);
    if (!result) {
      return { status: "missing", message: "snapshot file does not exist yet" };
    }
    // Stime: JSON.stringify per misurare la dimensione effettiva del file.
    const sizeBytes = JSON.stringify(result.data).length;
    return {
      status: "ok",
      etag: result.etag,
      sizeBytes,
      lastSyncedAt: null, // TODO: estrarre LastModified da R2 se serve
    };
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Errore tipato per il caller: "R2 non configurato, fai fallback DB".
 */
export class SnapshotUnavailableError extends Error {
  constructor() {
    super("Snapshot storage not configured");
    this.name = "SnapshotUnavailableError";
  }
}

// Re-export error types per i caller
export { SnapshotStorageError };
