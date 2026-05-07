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
import { and, asc, desc, eq, isNull } from "drizzle-orm";

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

export async function countAssets(): Promise<number> {
  const rows = await db.select({ id: mediaAssets.id }).from(mediaAssets);
  return rows.length;
}
