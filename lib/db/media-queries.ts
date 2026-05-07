import "server-only";

import { db } from "@/lib/db/drizzle";
import {
  mediaAssets,
  mediaFolders,
  type MediaAsset,
  type MediaFolder,
  type NewMediaAsset,
  type NewMediaFolder,
} from "@/lib/db/schema";
import { pages } from "@/lib/db/schema";
import { asc, count, desc, eq, inArray, isNull } from "drizzle-orm";

export type { MediaAsset, MediaFolder };

// ─── Folders ────────────────────────────────────────────────────────────────

export async function getAllFolders(): Promise<MediaFolder[]> {
  return db
    .select()
    .from(mediaFolders)
    .orderBy(asc(mediaFolders.parentId), asc(mediaFolders.name));
}

export async function getFolderById(id: number): Promise<MediaFolder | null> {
  const [row] = await db
    .select()
    .from(mediaFolders)
    .where(eq(mediaFolders.id, id))
    .limit(1);
  return row ?? null;
}

export async function createFolder(data: NewMediaFolder): Promise<MediaFolder> {
  const [row] = await db.insert(mediaFolders).values(data).returning();
  return row;
}

export async function updateFolderName(
  id: number,
  name: string,
  slug: string,
): Promise<MediaFolder | null> {
  const [row] = await db
    .update(mediaFolders)
    .set({ name, slug })
    .where(eq(mediaFolders.id, id))
    .returning();
  return row ?? null;
}

export async function deleteFolderById(id: number): Promise<MediaFolder | null> {
  const [row] = await db
    .delete(mediaFolders)
    .where(eq(mediaFolders.id, id))
    .returning();
  return row ?? null;
}

/**
 * Conta gli asset diretti in un folder (null = root). Non ricorsivo.
 */
export async function countAssetsInFolder(
  folderId: number | null,
): Promise<number> {
  const where =
    folderId === null
      ? isNull(mediaAssets.folderId)
      : eq(mediaAssets.folderId, folderId);
  const [row] = await db
    .select({ n: count() })
    .from(mediaAssets)
    .where(where);
  return row?.n ?? 0;
}

/**
 * Conta i sotto-folder diretti di un folder (null = root). Non ricorsivo.
 */
export async function countSubfolders(
  parentId: number | null,
): Promise<number> {
  const where =
    parentId === null
      ? isNull(mediaFolders.parentId)
      : eq(mediaFolders.parentId, parentId);
  const [row] = await db
    .select({ n: count() })
    .from(mediaFolders)
    .where(where);
  return row?.n ?? 0;
}

/**
 * Ritorna la catena dei folder dall'antenato fino al folder dato, in ordine
 * Root → … → folder. Per il breadcrumb. Restituisce array vuoto se folderId
 * è null (siamo già in root).
 */
export async function getFolderPath(folderId: number): Promise<MediaFolder[]> {
  const all = await getAllFolders();
  const byId = new Map(all.map((f) => [f.id, f]));
  const chain: MediaFolder[] = [];
  let current = byId.get(folderId);
  // Guard contro cicli: massimo 32 livelli
  let safety = 32;
  while (current && safety-- > 0) {
    chain.unshift(current);
    if (current.parentId === null) break;
    current = byId.get(current.parentId);
  }
  return chain;
}

/**
 * Verifica che `candidateAncestorId` sia effettivamente un antenato (o sé
 * stesso) di `folderId`. Serve per impedire move che creerebbero cicli.
 */
export async function isAncestor(
  candidateAncestorId: number,
  folderId: number,
): Promise<boolean> {
  if (candidateAncestorId === folderId) return true;
  const path = await getFolderPath(folderId);
  return path.some((f) => f.id === candidateAncestorId);
}

// ─── Assets ─────────────────────────────────────────────────────────────────

export async function getAssets(opts?: {
  folderId?: number | null;
}): Promise<MediaAsset[]> {
  if (opts?.folderId === undefined) {
    return db
      .select()
      .from(mediaAssets)
      .orderBy(desc(mediaAssets.createdAt));
  }
  const where =
    opts.folderId === null
      ? isNull(mediaAssets.folderId)
      : eq(mediaAssets.folderId, opts.folderId);
  return db
    .select()
    .from(mediaAssets)
    .where(where)
    .orderBy(desc(mediaAssets.createdAt));
}

export async function getAssetById(id: number): Promise<MediaAsset | null> {
  const [row] = await db
    .select()
    .from(mediaAssets)
    .where(eq(mediaAssets.id, id))
    .limit(1);
  return row ?? null;
}

export async function createAsset(data: NewMediaAsset): Promise<MediaAsset> {
  const [row] = await db.insert(mediaAssets).values(data).returning();
  return row;
}

export async function deleteAssetById(id: number): Promise<MediaAsset | null> {
  const [row] = await db
    .delete(mediaAssets)
    .where(eq(mediaAssets.id, id))
    .returning();
  return row ?? null;
}

export async function updateAssetFolder(
  id: number,
  folderId: number | null,
): Promise<MediaAsset | null> {
  const [row] = await db
    .update(mediaAssets)
    .set({ folderId })
    .where(eq(mediaAssets.id, id))
    .returning();
  return row ?? null;
}

export async function countAssets(): Promise<number> {
  const rows = await db.select({ id: mediaAssets.id }).from(mediaAssets);
  return rows.length;
}

/**
 * Bulk fetch di asset per id. Usato dal CMS resolver per convertire
 * `media_asset_id` (salvati nei custom fields delle pagine) in URL pubblici
 * prima di passarli ai template. Mantiene il contratto attuale dei template
 * `Record<string, string>` con URL.
 *
 * Ritorna una mappa assetId → MediaAsset; gli id non trovati sono assenti.
 */
export async function getAssetsByIds(
  ids: number[],
): Promise<Map<number, MediaAsset>> {
  const map = new Map<number, MediaAsset>();
  if (ids.length === 0) return map;
  const rows = await db
    .select()
    .from(mediaAssets)
    .where(inArray(mediaAssets.id, ids));
  for (const r of rows) map.set(r.id, r);
  return map;
}

/**
 * Best-effort: scan di tutti i `pages.customFields` (JSON) cercando il valore
 * `String(assetId)` come value di un qualunque field. Usato dal delete per
 * bloccare la rimozione di asset referenziati. Niente JSON path queries: i
 * customFields stanno in `text` e il volume è basso, scan in JS è sufficiente.
 *
 * False positive possibili (un text field che contiene la stessa stringa).
 * Acceptable per warning admin: se il count è > 0 blocchiamo, l'admin
 * verifica manualmente.
 */
export async function countAssetReferences(assetId: number): Promise<number> {
  const target = String(assetId);
  const rows = await db
    .select({ customFields: pages.customFields })
    .from(pages);
  let n = 0;
  for (const row of rows) {
    if (!row.customFields) continue;
    try {
      const parsed = JSON.parse(row.customFields) as Record<string, unknown>;
      for (const v of Object.values(parsed)) {
        if (v === target || v === assetId) {
          n += 1;
          break; // count una pagina come 1 ref, non N
        }
      }
    } catch {
      // ignore malformed JSON
    }
  }
  return n;
}
