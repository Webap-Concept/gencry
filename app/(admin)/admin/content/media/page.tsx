import { AdminSectionHeader } from "@/app/(admin)/admin/_components/section-header";
import { AdminSectionInfo } from "@/app/(admin)/admin/_components/section-info";
import {
  type AssetSortBy,
  type AssetSortDir,
  countAssetsInFolder,
  getAllFolders,
  getAssetReferences,
  getAssets,
  getFolderById,
  getFolderPath,
} from "@/lib/db/media-queries";
import { Image as ImageIcon } from "lucide-react";
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

function parseDir(raw: string | undefined): AssetSortDir {
  return raw === "asc" ? "asc" : "desc";
}

export default async function MediaPage({
  searchParams,
}: {
  searchParams: Promise<{
    folder?: string;
    page?: string;
    sort?: string;
    dir?: string;
  }>;
}) {
  const params = await searchParams;
  const currentFolderId = parseFolderId(params.folder);
  const requestedPage = parsePage(params.page);
  const sort = parseSort(params.sort);
  const dir = parseDir(params.dir);

  if (currentFolderId !== null) {
    const folder = await getFolderById(currentFolderId);
    if (!folder) notFound();
  }

  // Servi prima il count per clamp-are una `?page=999` fuori scala alla
  // pagina massima reale (così un link stale non mostra una griglia vuota).
  const totalAssets = await countAssetsInFolder(currentFolderId);
  const totalPages = Math.max(1, Math.ceil(totalAssets / PAGE_SIZE));
  const currentPage = Math.min(requestedPage, totalPages);
  const offset = (currentPage - 1) * PAGE_SIZE;

  const [folders, assets, folderPath, t] = await Promise.all([
    getAllFolders(),
    getAssets({
      folderId: currentFolderId,
      limit: PAGE_SIZE,
      offset,
      sortBy: sort,
      sortDir: dir,
    }),
    currentFolderId !== null ? getFolderPath(currentFolderId) : Promise.resolve([]),
    getTranslations("admin.content.media"),
  ]);

  // Reference scan in batch (single SELECT pages, scan in JS) — alimenta
  // i badge "usata in: /slug" sotto le thumbnail nella griglia.
  const references = await getAssetReferences(
    assets.map((a) => ({ id: a.id, storagePath: a.storagePath })),
  );

  return (
    <div className="space-y-5">
      <AdminSectionHeader
        icon={ImageIcon}
        breadcrumbLabel={t("breadcrumbContent")}
        title={t("pageTitle")}
        subtitle={t("pageSubtitle")}
        infoSlot={
          <AdminSectionInfo
            title={t("guideTitle")}
            ariaLabel={t("guideAriaLabel")}>
            <p>{t("guideIntro")}</p>
            <ul>
              <li>{t("guideBulletOriginal")}</li>
              <li>{t("guideBulletVariants")}</li>
              <li>{t("guideBulletWhereCmsBody")}</li>
              <li>{t("guideBulletWhereCmsHero")}</li>
              <li>{t("guideBulletWhereLightbox")}</li>
              <li>{t("guideBulletWhereAdmin")}</li>
            </ul>
            <p>{t("guideTuning")}</p>
          </AdminSectionInfo>
        }
      />

      <div
        className="rounded-xl shadow-sm overflow-hidden"
        style={{
          background: "var(--admin-card-bg)",
          border: "1px solid var(--admin-card-border)",
        }}>
        <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] divide-y md:divide-y-0 md:divide-x"
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
                />
              }
              assets={assets}
              folders={folders}
              references={Object.fromEntries(references)}
              folderId={currentFolderId}
              sort={sort}
              dir={dir}
            />
          </main>
        </div>
      </div>
    </div>
  );
}
