"use client";

import { useAdminSlug } from "@/app/(admin)/admin/_components/admin-slug-context";
import { getAdminRelPath } from "@/lib/admin-nav";
import { buildAdminPathFromSlug } from "@/lib/admin-paths-shared";
import {
  ArrowDown,
  ArrowDownAZ,
  ArrowUp,
  Calendar,
  FileType2,
  LayoutGrid,
  Rows3,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";

export type ThumbSize = "sm" | "md";
export type SortBy = "date" | "name" | "type";
export type SortDir = "asc" | "desc";

const SORT_OPTIONS: ReadonlyArray<{
  value: SortBy;
  labelKey: string;
  icon: React.ElementType;
  /** Direzione di default quando si clicca per la prima volta su questo
   *  sort. Date desc (più recenti prima), name/type asc (A→Z). */
  defaultDir: SortDir;
}> = [
  { value: "date", labelKey: "sortDate", icon: Calendar, defaultDir: "desc" },
  { value: "name", labelKey: "sortName", icon: ArrowDownAZ, defaultDir: "asc" },
  { value: "type", labelKey: "sortType", icon: FileType2, defaultDir: "asc" },
];

interface MediaToolbarProps {
  folderId: number | null;
  sort: SortBy;
  dir: SortDir;
  thumbSize: ThumbSize;
  onThumbSizeChange: (size: ThumbSize) => void;
}

export function MediaToolbar({
  folderId,
  sort,
  dir,
  thumbSize,
  onThumbSizeChange,
}: MediaToolbarProps) {
  const t = useTranslations("admin.content.media.toolbar");
  const adminSlug = useAdminSlug();
  const mediaBase = buildAdminPathFromSlug(
    adminSlug,
    getAdminRelPath("content-media"),
  );

  function buildSortHref(nextSort: SortBy): string {
    // Click sullo stesso sort attivo → flip-pa direzione. Click su un
    // altro sort → applica la sua direzione di default. Reset di `?page`
    // perché cambiando sort la posizione non ha più senso.
    const sameSort = nextSort === sort;
    const nextDir: SortDir = sameSort
      ? dir === "asc"
        ? "desc"
        : "asc"
      : (SORT_OPTIONS.find((o) => o.value === nextSort)?.defaultDir ?? "desc");
    const params = new URLSearchParams();
    if (folderId !== null) params.set("folder", String(folderId));
    if (nextSort !== "date") params.set("sort", nextSort);
    if (
      (nextSort === "date" && nextDir !== "desc") ||
      ((nextSort === "name" || nextSort === "type") && nextDir !== "asc")
    ) {
      params.set("dir", nextDir);
    }
    const qs = params.toString();
    return qs ? `${mediaBase}?${qs}` : mediaBase;
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {/* Sort group */}
      <div
        role="group"
        aria-label={t("sortGroupAria")}
        className="inline-flex items-center rounded-md overflow-hidden"
        style={{ border: "1px solid var(--admin-card-border)" }}>
        {SORT_OPTIONS.map((opt) => {
          const isActive = sort === opt.value;
          const Icon = opt.icon;
          const Chev = dir === "asc" ? ArrowUp : ArrowDown;
          // Tooltip differente quando il bottone è attivo: comunica che un
          // ulteriore click flippa la direzione invece di "non fare nulla".
          const labelText = t(opt.labelKey);
          const titleText = isActive
            ? t(dir === "asc" ? "sortFlipFromAsc" : "sortFlipFromDesc", {
                label: labelText,
              })
            : labelText;
          return (
            <Link
              key={opt.value}
              href={buildSortHref(opt.value)}
              aria-pressed={isActive}
              title={titleText}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium transition-colors"
              style={{
                background: isActive
                  ? "color-mix(in srgb, var(--admin-accent) 12%, transparent)"
                  : "transparent",
                color: isActive
                  ? "var(--admin-accent)"
                  : "var(--admin-text-muted)",
                borderRight: "1px solid var(--admin-card-border)",
              }}
              onMouseEnter={(e) => {
                if (!isActive)
                  e.currentTarget.style.background =
                    "var(--admin-page-bg, rgba(0,0,0,0.03))";
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.background = "transparent";
              }}>
              <Icon size={13} />
              <span>{labelText}</span>
              {isActive && (
                <Chev
                  size={14}
                  strokeWidth={2.6}
                  aria-label={t(dir === "asc" ? "sortAsc" : "sortDesc")}
                />
              )}
            </Link>
          );
        })}
      </div>

      {/* Thumb size group */}
      <div
        role="group"
        aria-label={t("sizeGroupAria")}
        className="inline-flex items-center rounded-md overflow-hidden"
        style={{ border: "1px solid var(--admin-card-border)" }}>
        <SizeButton
          active={thumbSize === "sm"}
          onClick={() => onThumbSizeChange("sm")}
          title={t("sizeSmall")}
          aria-label={t("sizeSmall")}>
          <LayoutGrid size={13} />
        </SizeButton>
        <SizeButton
          active={thumbSize === "md"}
          onClick={() => onThumbSizeChange("md")}
          title={t("sizeNormal")}
          aria-label={t("sizeNormal")}>
          <Rows3 size={13} />
        </SizeButton>
      </div>
    </div>
  );
}

function SizeButton({
  active,
  onClick,
  title,
  children,
  ...rest
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
} & React.AriaAttributes) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      {...rest}
      className="inline-flex items-center justify-center px-2.5 py-1.5 transition-colors"
      style={{
        background: active
          ? "color-mix(in srgb, var(--admin-accent) 12%, transparent)"
          : "transparent",
        color: active ? "var(--admin-accent)" : "var(--admin-text-muted)",
      }}
      onMouseEnter={(e) => {
        if (!active)
          e.currentTarget.style.background =
            "var(--admin-page-bg, rgba(0,0,0,0.03))";
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = "transparent";
      }}>
      {children}
    </button>
  );
}
