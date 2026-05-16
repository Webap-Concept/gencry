import {
  type AssetSortBy,
  type AssetSortDir,
  type AssetTypeFilter,
  countAssetsInFolder,
  getAllFolders,
  getAssetReferences,
  getAssets,
  getFolderById,
  getFolderPath,
} from "@/lib/db/media-queries";
import type { Metadata } from "next";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { FolderBreadcrumb } from "./_components/folder-breadcrumb";
import { FolderTree } from "./_components/folder-tree";
import { MediaUploader } from "./_components/media-uploader";
import { MediaPagination } from "./_components/media-pagination";
import { MediaShell } from "./_components/media-shell";

const PAGE_SIZE = 30;

export async function generateMetadata(): Promise<Metadata> {
  await connection();
  const t = await getTranslations("admin.content.media");
  return { title: t("metaTitle") };
}

export const dynamic = "force-dynamic";

function parseFolderId(raw: string | undefined): number | null {
  if (!raw || raw === "root") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parsePage(raw: string | undefined): number {
  if (!raw) return 1;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

function parseSort(raw: string | undefined): AssetSortBy {
  return raw === "name" || raw === "type" ? raw : "date";
}

/**
 * Default direction per sort:
 *   date → desc (più recenti prima)
 *   name/type → asc (A→Z)
 *
 * Deve combaciare con `SORT_OPTIONS[].defaultDir` in media-toolbar.tsx,
 * altrimenti il toolbar omette `dir` dall'URL pensando "default per name=asc"
 * mentre il server applicherebbe desc → primo click su un sort non-date
 * si comporta in modo opposto a quanto mostrato dal chevron.
 */
function parseDir(raw: string | undefined, sort: AssetSortBy): AssetSortDir {
  if (raw === "asc" || raw === "desc") return raw;
  return sort === "date" ? "desc" : "asc";
}

/** Whitelist server-side per `?type=` (toolbar filter). Qualunque altro
 *  valore (incluso "all" o assente) → null = nessun filtro. */
function parseTypeFilter(raw: string | undefined): AssetTypeFilter | null {
  return raw === "image" ||
    raw === "video" ||
    raw === "audio" ||
    raw === "document" ||
    raw === "other"
    ? raw
    : null;
}

export default async function MediaPage({
  searchParams,
}: {
  searchParams: Promise<{
    folder?: string;
    page?: string;
    sort?: string;
    dir?: string;
    type?: string;
  }>;
}) {
  const params = await searchParams;
  const currentFolderId = parseFolderId(params.folder);
  const requestedPage = parsePage(params.page);
  const sort = parseSort(params.sort);
  const dir = parseDir(params.dir, sort);
  const typeFilter = parseTypeFilter(params.type);

  // Phase 1 — parallel fetch everything that doesn't depend on
  // pagination math. `getAssets` is the only call that needs the
  // computed `offset` (which itself needs `totalAssets`), so it lives
  // in phase 2. The folder-existence check still happens before any
  // rendering work — just after the batch lands.
  //
  // Edge case: when the requested folder doesn't exist (URL tampering),
  // we've already paid for the rest of the batch. That's an exceptional
  // path; the happy path saves 2 sequential round-trips.
  const [folder, totalAssets, folders, folderPath] = await Promise.all([
    currentFolderId !== null ? getFolderById(currentFolderId) : Promise.resolve(null),
    countAssetsInFolder(currentFolderId, typeFilter ?? undefined),
    getAllFolders(),
    currentFolderId !== null ? getFolderPath(currentFolderId) : Promise.resolve([]),
  ]);

  if (currentFolderId !== null && !folder) notFound();

  // Clamp `?page=999` to the actual max — keeps stale links from
  // landing on an empty grid.
  const totalPages = Math.max(1, Math.ceil(totalAssets / PAGE_SIZE));
  const currentPage = Math.min(requestedPage, totalPages);
  const offset = (currentPage - 1) * PAGE_SIZE;

  // Phase 2 — assets need the resolved offset, references need the
  // asset list. These two stay sequential.
  const assets = await getAssets({
    folderId: currentFolderId,
    limit: PAGE_SIZE,
    offset,
    sortBy: sort,
    sortDir: dir,
    typeFilter: typeFilter ?? undefined,
  });

  // Reference scan in batch (single SELECT pages, scan in JS) — alimenta
  // i badge "usata in: /slug" sotto le thumbnail nella griglia.
  const references = await getAssetReferences(
    assets.map((a) => ({ id: a.id, storagePath: a.storagePath })),
  );

  return (
    <div
      className="rounded-xl shadow-sm overflow-hidden"
      style={{
        background: "var(--admin-card-bg)",
        border: "1px solid var(--admin-card-border)",
      }}>
      <div
        className="grid grid-cols-1 md:grid-cols-[260px_1fr] divide-y md:divide-y-0 md:divide-x"
        style={{ borderColor: "var(--admin-card-border)" }}>
        <aside className="p-4">
          <FolderTree folders={folders} currentFolderId={currentFolderId} />
        </aside>

        <main className="p-5 min-w-0">
          <MediaShell
            breadcrumb={<FolderBreadcrumb path={folderPath} />}
            uploader={<MediaUploader currentFolderId={currentFolderId} />}
            pagination={
              <MediaPagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalAssets={totalAssets}
                folderId={currentFolderId}
                sort={sort}
                dir={dir}
                typeFilter={typeFilter}
              />
            }
            assets={assets}
            folders={folders}
            references={Object.fromEntries(references)}
            folderId={currentFolderId}
            sort={sort}
            dir={dir}
            typeFilter={typeFilter}
          />
        </main>
      </div>
    </div>
  );
}
