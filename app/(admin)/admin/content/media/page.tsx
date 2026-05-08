import { AdminSectionHeader } from "@/app/(admin)/admin/_components/section-header";
import {
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
import { MediaGrid } from "./_components/media-grid";

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

export default async function MediaPage({
  searchParams,
}: {
  searchParams: Promise<{ folder?: string }>;
}) {
  const params = await searchParams;
  const currentFolderId = parseFolderId(params.folder);

  if (currentFolderId !== null) {
    const folder = await getFolderById(currentFolderId);
    if (!folder) notFound();
  }

  const [folders, assets, folderPath, t] = await Promise.all([
    getAllFolders(),
    getAssets({ folderId: currentFolderId }),
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

          <main className="p-5 space-y-4 min-w-0">
            <FolderBreadcrumb path={folderPath} />
            <MediaUploader currentFolderId={currentFolderId} />
            <MediaGrid
              assets={assets}
              folders={folders}
              references={Object.fromEntries(references)}
            />
          </main>
        </div>
      </div>
    </div>
  );
}
