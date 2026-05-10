"use client";

import { useAdminSlug } from "@/app/(admin)/admin/_components/admin-slug-context";
import type { AssetTypeFilter } from "@/lib/db/media-queries";
import { getAdminRelPath } from "@/lib/admin-nav";
import { buildAdminPathFromSlug } from "@/lib/admin-paths-shared";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";

interface MediaPaginationProps {
  currentPage: number;
  totalPages: number;
  totalAssets: number;
  folderId: number | null;
  /** Default sort/dir = ('date','desc'): solo i valori non-default
   *  vengono inclusi nei link per tenere gli URL puliti. */
  sort?: "date" | "name" | "type";
  dir?: "asc" | "desc";
  /** null = nessun filtro attivo, omesso dall'URL. */
  typeFilter?: AssetTypeFilter | null;
}

export function MediaPagination({
  currentPage,
  totalPages,
  totalAssets,
  folderId,
  sort = "date",
  dir = "desc",
  typeFilter = null,
}: MediaPaginationProps) {
  const t = useTranslations("admin.content.media.pagination");
  const adminSlug = useAdminSlug();
  const mediaBase = buildAdminPathFromSlug(
    adminSlug,
    getAdminRelPath("content-media"),
  );

  // Una sola pagina (o nessun asset) → nessun footer: la griglia parla da sé.
  if (totalPages <= 1) return null;

  function buildHref(page: number): string {
    const params = new URLSearchParams();
    if (folderId !== null) params.set("folder", String(folderId));
    if (page > 1) params.set("page", String(page));
    if (sort !== "date") params.set("sort", sort);
    // Direction default dipende dal sort: date→desc, name/type→asc.
    const isDefaultDir =
      (sort === "date" && dir === "desc") ||
      ((sort === "name" || sort === "type") && dir === "asc");
    if (!isDefaultDir) params.set("dir", dir);
    if (typeFilter !== null) params.set("type", typeFilter);
    const qs = params.toString();
    return qs ? `${mediaBase}?${qs}` : mediaBase;
  }

  const prevPage = currentPage > 1 ? currentPage - 1 : null;
  const nextPage = currentPage < totalPages ? currentPage + 1 : null;

  return (
    <nav
      className="flex items-center justify-between pt-4 mt-2"
      style={{ borderTop: "1px solid var(--admin-card-border)" }}
      aria-label={t("ariaLabel")}>
      <p
        className="text-xs"
        style={{ color: "var(--admin-text-muted)" }}>
        {t("indicator", {
          current: currentPage,
          total: totalPages,
          count: totalAssets,
        })}
      </p>
      <div className="flex items-center gap-1">
        <PageButton
          href={prevPage ? buildHref(prevPage) : undefined}
          disabled={!prevPage}
          ariaLabel={t("prev")}>
          <ChevronLeft className="w-4 h-4" />
        </PageButton>
        <PageButton
          href={nextPage ? buildHref(nextPage) : undefined}
          disabled={!nextPage}
          ariaLabel={t("next")}>
          <ChevronRight className="w-4 h-4" />
        </PageButton>
      </div>
    </nav>
  );
}

function PageButton({
  href,
  disabled,
  ariaLabel,
  children,
}: {
  href: string | undefined;
  disabled: boolean;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  const baseStyle: React.CSSProperties = {
    border: "1px solid var(--admin-card-border)",
    color: disabled ? "var(--admin-text-faint)" : "var(--admin-text-muted)",
    background: "transparent",
    opacity: disabled ? 0.5 : 1,
    cursor: disabled ? "not-allowed" : "pointer",
  };

  if (disabled || !href) {
    return (
      <span
        aria-label={ariaLabel}
        aria-disabled="true"
        className="inline-flex items-center justify-center w-8 h-8 rounded-md"
        style={baseStyle}>
        {children}
      </span>
    );
  }

  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      className="inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-black/5 dark:hover:bg-white/5"
      style={baseStyle}>
      {children}
    </Link>
  );
}
