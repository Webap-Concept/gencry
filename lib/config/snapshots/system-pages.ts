// lib/config/snapshots/system-pages.ts
//
// Snapshot layer per `getSystemPageSlugs`. Stesso pattern di app-settings.ts:
// il file JSON in R2 è sorgente di verità per il runtime, il DB rimane
// sorgente di verità per le mutation. Il sync è triggherato dalle admin
// actions che modificano la tabella `pages` per system pages (creazione,
// rename slug, delete).
//
// Differenze rispetto a app-settings.ts:
//   - dato molto più piccolo (4-5 entry) → cache locale ancora più efficace
//   - cambi rarissimi (~1/anno) → il TTL ETag check può essere più alto,
//     ma manteniamo 30s per consistenza col pattern
//   - niente advisory lock necessario lato chiamate (le admin actions di
//     pages sono già protette dalla loro propria transactional logic;
//     un eventuale conflitto sul system slug è già lockato a livello UI)

import "server-only";

import { fetchSystemPageSlugsRaw } from "@/lib/db/pages-queries";
import {
  getSnapshotStorage,
} from "@/lib/config/snapshot-storage";
import { SnapshotUnavailableError } from "./app-settings";

const SNAPSHOT_KEY = "system-pages.json";

export interface SystemPagesSnapshotMeta {
  version: number;
  writtenAt: string;
  writtenBy: string | null;
}

interface SnapshotFile {
  _meta: SystemPagesSnapshotMeta;
  data: Record<string, string>;
}

function isSnapshotFile(parsed: unknown): parsed is SnapshotFile {
  return (
    typeof parsed === "object" &&
    parsed !== null &&
    "_meta" in parsed &&
    "data" in parsed
  );
}

function normalizeSnapshotBody(parsed: unknown): {
  data: Record<string, string>;
  meta: SystemPagesSnapshotMeta;
} {
  if (isSnapshotFile(parsed)) {
    return { data: parsed.data, meta: parsed._meta };
  }
  return {
    data: parsed as Record<string, string>,
    meta: { version: 0, writtenAt: new Date(0).toISOString(), writtenBy: null },
  };
}

const ETAG_CHECK_INTERVAL_MS = 30_000;

type CacheEntry = {
  data: Record<string, string>;
  meta: SystemPagesSnapshotMeta;
  etag: string;
  lastEtagCheckAt: number;
};

let _cache: CacheEntry | null = null;

/**
 * Read system page slugs dallo snapshot. Hot path: chiamato da
 * `getSystemPageSlugs` con fallback DB.
 *
 * Fallback chain:
 *   1. R2 non configurato → throw SnapshotUnavailableError (caller fa DB)
 *   2. Snapshot not found → bootstrap: leggi DB, write, ritorna
 *   3. R2 read error → throw (caller fa DB)
 */
export async function readSystemPageSlugsSnapshot(): Promise<Record<string, string>> {
  const storage = await getSnapshotStorage();
  if (!storage) {
    throw new SnapshotUnavailableError();
  }

  const now = Date.now();

  if (_cache && now - _cache.lastEtagCheckAt < ETAG_CHECK_INTERVAL_MS) {
    return _cache.data;
  }

  if (_cache) {
    try {
      const head = await storage.head(SNAPSHOT_KEY);
      if (head && head.etag === _cache.etag) {
        _cache.lastEtagCheckAt = now;
        return _cache.data;
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[snapshot/system-pages] head check failed, serving cached", err);
      _cache.lastEtagCheckAt = now;
      return _cache.data;
    }
  }

  const fresh = await storage.read<unknown>(SNAPSHOT_KEY);
  if (fresh) {
    const normalized = normalizeSnapshotBody(fresh.data);
    _cache = {
      data: normalized.data,
      meta: normalized.meta,
      etag: fresh.etag,
      lastEtagCheckAt: now,
    };
    return normalized.data;
  }

  // Bootstrap: snapshot non esiste, leggi da DB e scrivi
  // eslint-disable-next-line no-console
  console.info("[snapshot/system-pages] bootstrap — writing first snapshot from DB");
  const dbData = await fetchSystemPageSlugsRaw();
  const bootstrapMeta: SystemPagesSnapshotMeta = {
    version: 1,
    writtenAt: new Date().toISOString(),
    writtenBy: null,
  };
  const bootstrapFile: SnapshotFile = { _meta: bootstrapMeta, data: dbData };
  try {
    const written = await storage.write(SNAPSHOT_KEY, bootstrapFile);
    _cache = {
      data: dbData,
      meta: bootstrapMeta,
      etag: written.etag,
      lastEtagCheckAt: now,
    };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[snapshot/system-pages] bootstrap write failed", err);
  }
  return dbData;
}

/**
 * Forza il sync del snapshot leggendo fresh dal DB. Chiamata da admin actions
 * che mutano la tabella `pages` con system slug.
 */
export async function syncSystemPageSlugsSnapshot(
  writtenBy: string | null = null,
): Promise<void> {
  const storage = await getSnapshotStorage();
  if (!storage) {
    return;
  }
  const data = await fetchSystemPageSlugsRaw();

  // Calcola version incrementale
  let nextVersion = 1;
  try {
    const current = await storage.read<unknown>(SNAPSHOT_KEY);
    if (current) {
      const normalized = normalizeSnapshotBody(current.data);
      nextVersion = normalized.meta.version + 1;
    }
  } catch {
    nextVersion = 1;
  }

  const meta: SystemPagesSnapshotMeta = {
    version: nextVersion,
    writtenAt: new Date().toISOString(),
    writtenBy,
  };
  const file: SnapshotFile = { _meta: meta, data };
  const written = await storage.write(SNAPSHOT_KEY, file);

  _cache = {
    data,
    meta,
    etag: written.etag,
    lastEtagCheckAt: Date.now(),
  };
}

/**
 * Health check per il widget admin.
 */
export type SystemPagesSnapshotHealth =
  | { status: "disabled"; reason: "r2-not-configured" }
  | {
      status: "ok";
      etag: string;
      sizeBytes: number;
      meta: SystemPagesSnapshotMeta;
    }
  | { status: "missing"; message: string }
  | { status: "error"; message: string };

export async function getSystemPageSlugsSnapshotHealth(): Promise<SystemPagesSnapshotHealth> {
  try {
    const storage = await getSnapshotStorage();
    if (!storage) {
      return { status: "disabled", reason: "r2-not-configured" };
    }
    const result = await storage.read<unknown>(SNAPSHOT_KEY);
    if (!result) {
      return {
        status: "missing",
        message: "Snapshot file not found — admin save any system page to create it.",
      };
    }
    const normalized = normalizeSnapshotBody(result.data);
    const sizeBytes = JSON.stringify({
      _meta: normalized.meta,
      data: normalized.data,
    }).length;
    return {
      status: "ok",
      etag: result.etag,
      sizeBytes,
      meta: normalized.meta,
    };
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
