import type { MediaFolder } from "@/lib/db/media-queries";
import { ChevronRight, Folder } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

interface FolderBreadcrumbProps {
  path: MediaFolder[];
}

/**
 * Breadcrumb Root > Foo > Bar (last item non-clickable, è il folder corrente).
 * Sempre rendered: in root mostra solo "Root".
 */
export async function FolderBreadcrumb({ path }: FolderBreadcrumbProps) {
  const t = await getTranslations("admin.content.media.tree");

  return (
    <nav
      className="flex items-center gap-1 text-sm flex-wrap"
      aria-label="folder breadcrumb">
      <Folder className="w-4 h-4" style={{ color: "var(--admin-text-muted)" }} />
      {path.length === 0 ? (
        <span style={{ color: "var(--admin-text)" }}>{t("root")}</span>
      ) : (
        <>
          <Link
            href="/admin/content/media"
            className="hover:underline"
            style={{ color: "var(--admin-text-muted)" }}>
            {t("root")}
          </Link>
          {path.map((folder, idx) => {
            const isLast = idx === path.length - 1;
            return (
              <span key={folder.id} className="flex items-center gap-1">
                <ChevronRight
                  className="w-3.5 h-3.5"
                  style={{ color: "var(--admin-text-muted)" }}
                />
                {isLast ? (
                  <span style={{ color: "var(--admin-text)" }}>{folder.name}</span>
                ) : (
                  <Link
                    href={`/admin/content/media?folder=${folder.id}`}
                    className="hover:underline"
                    style={{ color: "var(--admin-text-muted)" }}>
                    {folder.name}
                  </Link>
                )}
              </span>
            );
          })}
        </>
      )}
    </nav>
  );
}
