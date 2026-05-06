"use client";

import ConfirmModal from "@/app/(admin)/admin/_components/confirm-modal";
import Tooltip from "@/app/(admin)/admin/_components/tooltip";
import { getAdminPath } from "@/lib/admin-nav";
import type { Page, PageTemplate } from "@/lib/db/schema";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  GitFork,
  Globe,
  Lock,
  PanelTop,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { deletePageAction, togglePageStatusAction } from "../actions";

const PAGE_SIZE = 10;

type TemplateWithFields = PageTemplate & {
  fields: import("@/lib/db/schema").TemplateField[];
};

interface DeleteTarget {
  slug: string;
  title: string;
  descendants: number;
}

type PagesTab = "user" | "system";

// ─── Helpers ────────────────────────────────────────────────────────────────
function parseRules(
  raw: string | null | undefined,
): Record<string, unknown> {
  try {
    return JSON.parse(raw ?? "{}");
  } catch {
    return {};
  }
}

function getAllowedChildIds(
  template: TemplateWithFields | undefined,
): number[] {
  if (!template) return [];
  const cfg = parseRules(template.rules);
  const ids = cfg.allowedChildTemplateIds;
  if (Array.isArray(ids)) return ids.map(Number).filter(Boolean);
  return [];
}

// ─── ChildPaginator ──────────────────────────────────────────────────────────
function ChildPaginator({
  total,
  page,
  totalPages,
  search,
  searchResults,
  onSearch,
  onPrev,
  onNext,
}: {
  total: number;
  page: number;
  totalPages: number;
  search: string;
  searchResults: number | null;
  onSearch: (v: string) => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const t = useTranslations("admin.content.pages.manager");
  const inputRef = useRef<HTMLInputElement>(null);
  const isSearching = search.trim().length > 0;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
        marginTop: "4px",
        padding: "5px 8px",
        borderRadius: "10px",
        background:
          "color-mix(in srgb, var(--admin-text-faint) 6%, var(--admin-page-bg))",
        border:
          "1px dashed color-mix(in srgb, var(--admin-text-faint) 20%, transparent)",
      }}>
      <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
        <Search
          size={11}
          style={{
            position: "absolute",
            left: "7px",
            top: "50%",
            transform: "translateY(-50%)",
            color: "var(--admin-text-faint)",
            pointerEvents: "none",
          }}
        />
        <input
          ref={inputRef}
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder={t("childSearchPlaceholder")}
          style={{
            width: "100%",
            paddingLeft: "22px",
            paddingRight: isSearching ? "22px" : "6px",
            paddingTop: "3px",
            paddingBottom: "3px",
            fontSize: "11px",
            background: "transparent",
            border: "none",
            outline: "none",
            color: "var(--admin-text)",
          }}
        />
        {isSearching && (
          <button
            type="button"
            onClick={() => {
              onSearch("");
              inputRef.current?.focus();
            }}
            style={{
              position: "absolute",
              right: "4px",
              top: "50%",
              transform: "translateY(-50%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "16px",
              height: "16px",
              borderRadius: "50%",
              background: "var(--admin-text-faint)",
              border: "none",
              cursor: "pointer",
              color: "var(--admin-card-bg)",
              padding: 0,
            }}>
            <X size={9} />
          </button>
        )}
      </div>

      <div
        style={{
          width: "1px",
          height: "14px",
          background: "var(--admin-border)",
          flexShrink: 0,
        }}
      />

      {isSearching ? (
        <span
          style={{
            fontSize: "11px",
            color: "var(--admin-text-faint)",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}>
          {t("childSearchResults", { count: searchResults ?? 0 })}
        </span>
      ) : (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
            flexShrink: 0,
          }}>
          <button
            type="button"
            onClick={onPrev}
            disabled={page === 1}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "20px",
              height: "20px",
              borderRadius: "5px",
              border: "1px solid var(--admin-border)",
              background: "transparent",
              cursor: page === 1 ? "not-allowed" : "pointer",
              color: page === 1 ? "var(--admin-text-faint)" : "var(--admin-text-muted)",
              opacity: page === 1 ? 0.4 : 1,
              padding: 0,
            }}>
            <ChevronLeft size={11} />
          </button>
          <span
            style={{
              fontSize: "11px",
              color: "var(--admin-text-muted)",
              whiteSpace: "nowrap",
              minWidth: "36px",
              textAlign: "center",
            }}>
            {page} / {totalPages}
          </span>
          <button
            type="button"
            onClick={onNext}
            disabled={page === totalPages}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "20px",
              height: "20px",
              borderRadius: "5px",
              border: "1px solid var(--admin-border)",
              background: "transparent",
              cursor: page === totalPages ? "not-allowed" : "pointer",
              color: page === totalPages ? "var(--admin-text-faint)" : "var(--admin-text-muted)",
              opacity: page === totalPages ? 0.4 : 1,
              padding: 0,
            }}>
            <ChevronRight size={11} />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── ChildTemplatePicker ─────────────────────────────────────────────────────
function ChildTemplatePicker({
  parentTitle,
  options,
  onSelect,
  onCancel,
}: {
  parentTitle: string;
  options: TemplateWithFields[];
  onSelect: (templateId: number) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("admin.content.pages.manager");
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.55)" }}
      onClick={onCancel}>
      <div
        className="rounded-2xl p-6 w-full max-w-sm"
        style={{
          background: "var(--admin-card-bg)",
          border: "1px solid var(--admin-card-border)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
        }}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck size={15} style={{ color: "var(--admin-accent)" }} />
          <h3 className="text-sm font-semibold" style={{ color: "var(--admin-text)" }}>
            {t("pickerTitle")}
          </h3>
        </div>
        <p className="text-xs mb-5" style={{ color: "var(--admin-text-muted)" }}>
          {t("pickerSubtitleBefore")}{" "}
          <strong style={{ color: "var(--admin-text)" }}>{parentTitle}</strong>
          {t("pickerSubtitleAfter")}
        </p>
        <div className="space-y-2 mb-5">
          {options.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onSelect(t.id)}
              className="w-full flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors"
              style={{
                background: "var(--admin-input-bg)",
                border: "1px solid var(--admin-border)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--admin-accent)";
                e.currentTarget.style.background = "color-mix(in srgb, var(--admin-accent) 8%, var(--admin-input-bg))";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--admin-border)";
                e.currentTarget.style.background = "var(--admin-input-bg)";
              }}>
              <PanelTop size={15} style={{ color: "var(--admin-accent)", flexShrink: 0 }} />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: "var(--admin-text)" }}>
                  {t.name}
                </p>
                <p className="text-xs font-mono truncate" style={{ color: "var(--admin-text-faint)" }}>
                  {t.slug}
                </p>
              </div>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="w-full py-2 rounded-lg text-sm transition-colors"
          style={{
            background: "var(--admin-input-bg)",
            border: "1px solid var(--admin-border)",
            color: "var(--admin-text-muted)",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--admin-input-border)")}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--admin-border)")}>
          {t("pickerCancel")}
        </button>
      </div>
    </div>
  );
}

// ─── PageRow ──────────────────────────────────────────────────────────────────
function PageRow({
  page,
  allPages,
  templates,
  depth,
  expandedIds,
  toggleExpand,
  onEdit,
  onDeleteRequest,
  onNewChild,
  onToggleStatus,
  pendingToggleId,
  searchActive,
  appDomain,
}: {
  page: Page;
  allPages: Page[];
  templates: TemplateWithFields[];
  depth: number;
  expandedIds: Set<number>;
  toggleExpand: (id: number) => void;
  onEdit: (id: number) => void;
  onDeleteRequest: (target: DeleteTarget) => void;
  onNewChild: (id: number) => void;
  onToggleStatus: (id: number, status: string) => void;
  pendingToggleId: number | null;
  searchActive: boolean;
  appDomain: string;
}) {
  const t = useTranslations("admin.content.pages.manager");
  const allChildren = allPages.filter((p) => p.parentId === page.id);
  const hasChildren = allChildren.length > 0;
  const isExpanded = expandedIds.has(page.id);
  const isPublished = page.status === "published";
  const tplName = templates.find((t) => t.id === page.templateId)?.name;
  const isPendingToggle = pendingToggleId === page.id;
  const indent = depth * 20;
  const isSystem = Boolean((page as Page & { isSystem?: boolean }).isSystem);

  const needsPagination = allChildren.length > PAGE_SIZE;
  const [childPage, setChildPage] = useState(1);
  const [childSearch, setChildSearch] = useState("");

  useEffect(() => {
    if (!isExpanded) {
      setChildPage(1);
      setChildSearch("");
    }
  }, [isExpanded]);

  const isChildSearching = childSearch.trim().length > 0;
  const filteredChildren = isChildSearching
    ? allChildren.filter(
        (c) =>
          c.title.toLowerCase().includes(childSearch.toLowerCase()) ||
          c.slug.toLowerCase().includes(childSearch.toLowerCase()),
      )
    : allChildren;

  const totalPages = Math.ceil(allChildren.length / PAGE_SIZE);
  const pagedChildren = isChildSearching
    ? filteredChildren
    : filteredChildren.slice((childPage - 1) * PAGE_SIZE, childPage * PAGE_SIZE);

  const frontUrl =
    isPublished && appDomain
      ? `${appDomain.replace(/\/+$/, "")}/${page.slug}`
      : null;
  const previewUrl = `/admin/preview/${page.id}`;

  function countDescendants(id: number): number {
    const direct = allPages.filter((p) => p.parentId === id);
    return direct.reduce((acc, child) => acc + 1 + countDescendants(child.id), 0);
  }

  function stopRow(e: React.MouseEvent) {
    e.stopPropagation();
  }

  return (
    <>
      <div
        onClick={() => { if (hasChildren) toggleExpand(page.id); }}
        className="flex items-center gap-2 px-3 py-2.5 rounded-xl transition-colors group"
        style={{
          background: "var(--admin-card-bg)",
          border: "1px solid var(--admin-card-border)",
          marginLeft: `${indent}px`,
          opacity: isPendingToggle ? 0.6 : 1,
          transition: "opacity 160ms ease, border-color 160ms ease",
          cursor: hasChildren ? "pointer" : "default",
        }}
        onMouseEnter={(e) =>
          ((e.currentTarget as HTMLDivElement).style.borderColor = "var(--admin-input-border)")
        }
        onMouseLeave={(e) =>
          ((e.currentTarget as HTMLDivElement).style.borderColor = "var(--admin-card-border)")
        }>
        <span
          className="flex items-center justify-center w-6 h-6 rounded shrink-0"
          style={{ color: hasChildren ? "var(--admin-text-muted)" : "transparent" }}>
          <ChevronRight
            size={14}
            style={{
              transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
              transition: "transform 160ms ease",
            }}
          />
        </span>

        {hasChildren ? (
          <span
            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-semibold shrink-0 transition-colors"
            style={{
              background: isExpanded
                ? "color-mix(in srgb, var(--admin-accent) 14%, var(--admin-card-bg))"
                : "color-mix(in srgb, var(--admin-text-faint) 14%, var(--admin-card-bg))",
              color: isExpanded ? "var(--admin-accent)" : "var(--admin-text-muted)",
              border: isExpanded
                ? "1px solid color-mix(in srgb, var(--admin-accent) 28%, transparent)"
                : "1px solid color-mix(in srgb, var(--admin-text-faint) 22%, transparent)",
              minWidth: "28px",
              justifyContent: "center",
            }}>
            +{allChildren.length}
          </span>
        ) : (
          <span className="w-7 shrink-0" />
        )}

        <span
          className="w-2 h-2 rounded-full shrink-0 transition-colors"
          style={{ background: isPublished ? "#22c55e" : "var(--admin-text-faint)" }}
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium truncate" style={{ color: "var(--admin-text)" }}>
              {page.title}
            </p>
          </div>
          <p className="text-xs font-mono truncate" style={{ color: "var(--admin-text-faint)" }}>
            /{page.slug}
          </p>
        </div>

        {tplName && (
          <span
            className="hidden sm:flex items-center gap-1 text-xs px-2 py-0.5 rounded-full shrink-0"
            style={{
              background: "color-mix(in srgb, var(--admin-accent) 10%, var(--admin-card-bg))",
              color: "var(--admin-accent)",
              border: "1px solid color-mix(in srgb, var(--admin-accent) 20%, transparent)",
            }}>
            <PanelTop size={10} />
            {tplName}
          </span>
        )}

        {/* Status badge: nascosto per le system pages — sono sempre
            published e non si depubblicano. */}
        {!isSystem && (
          <span
            className="hidden sm:flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium shrink-0 whitespace-nowrap transition-all"
            style={{
              background: isPublished
                ? "color-mix(in srgb, #22c55e 12%, var(--admin-card-bg))"
                : "color-mix(in srgb, var(--admin-text-faint) 15%, var(--admin-card-bg))",
              color: isPublished ? "#22c55e" : "var(--admin-text-muted)",
              border: isPublished
                ? "1px solid color-mix(in srgb, #22c55e 25%, transparent)"
                : "1px solid color-mix(in srgb, var(--admin-text-faint) 25%, transparent)",
            }}>
            {isPublished ? (
              <>
                <Globe size={10} /> {t("statusPublished")}
              </>
            ) : (
              <>{t("statusDraft")}</>
            )}
          </span>
        )}

        <div className="flex items-center gap-0.5 shrink-0" onClick={stopRow}>
          <Tooltip label={t("rowEdit")} side="top">
            <button
              onClick={() => onEdit(page.id)}
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: "var(--admin-text-faint)" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--admin-hover-bg)";
                e.currentTarget.style.color = "var(--admin-text-muted)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "var(--admin-text-faint)";
              }}>
              <Pencil size={13} />
            </button>
          </Tooltip>

          {isPublished && frontUrl && (
            <Tooltip label={t("rowViewLive")} side="top">
              <a
                href={frontUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 rounded-lg transition-colors inline-flex items-center"
                style={{ color: "#22c55e" }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLAnchorElement).style.background =
                    "color-mix(in srgb, #22c55e 12%, var(--admin-card-bg))";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLAnchorElement).style.background = "transparent";
                }}>
                <ExternalLink size={13} />
              </a>
            </Tooltip>
          )}

          {!isPublished && (
            <Tooltip label={t("rowPreviewDraft")} side="top">
              <a
                href={previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 rounded-lg transition-colors inline-flex items-center"
                style={{ color: "var(--admin-text-faint)" }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLAnchorElement).style.background =
                    "color-mix(in srgb, var(--admin-accent) 10%, var(--admin-card-bg))";
                  (e.currentTarget as HTMLAnchorElement).style.color = "var(--admin-accent)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLAnchorElement).style.background = "transparent";
                  (e.currentTarget as HTMLAnchorElement).style.color = "var(--admin-text-faint)";
                }}>
                <Eye size={13} />
              </a>
            </Tooltip>
          )}

          {/* New child — only for non-system pages */}
          {!isSystem && (
            <Tooltip label={t("rowNewChild")} side="top">
              <button
                onClick={() => onNewChild(page.id)}
                className="p-1.5 rounded-lg transition-colors"
                style={{ color: "var(--admin-text-faint)" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background =
                    "color-mix(in srgb, var(--admin-accent) 10%, var(--admin-card-bg))";
                  e.currentTarget.style.color = "var(--admin-accent)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "var(--admin-text-faint)";
                }}>
                <GitFork size={13} />
              </button>
            </Tooltip>
          )}

          {/* Toggle publish/unpublish: nascosto per le system pages —
              sono sempre published per definizione (servono i meta a
              runtime ai page handler dedicati). */}
          {!isSystem && (
            <Tooltip
              label={isPublished ? t("rowUnpublish") : t("rowPublish")}
              side="top">
              <button
                onClick={() => onToggleStatus(page.id, page.status)}
                disabled={isPendingToggle}
                className="p-1.5 rounded-lg transition-colors"
                style={{ color: isPublished ? "#22c55e" : "var(--admin-text-faint)" }}
                onMouseEnter={(e) => {
                  if (isPublished) {
                    e.currentTarget.style.background =
                      "color-mix(in srgb, #ef4444 10%, var(--admin-card-bg))";
                    e.currentTarget.style.color = "#ef4444";
                  } else {
                    e.currentTarget.style.background =
                      "color-mix(in srgb, #22c55e 10%, var(--admin-card-bg))";
                    e.currentTarget.style.color = "#22c55e";
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = isPublished ? "#22c55e" : "var(--admin-text-faint)";
                }}>
                {isPendingToggle ? (
                  <span
                    className="block w-3 h-3 border border-t-transparent rounded-full animate-spin"
                    style={{
                      borderColor: "var(--admin-accent)",
                      borderTopColor: "transparent",
                    }}
                  />
                ) : isPublished ? (
                  <EyeOff size={13} />
                ) : (
                  <Globe size={13} />
                )}
              </button>
            </Tooltip>
          )}

          {!isSystem && (
            <Tooltip label={t("rowDelete")} side="top">
              <button
                onClick={() =>
                  onDeleteRequest({
                    slug: page.slug,
                    title: page.title,
                    descendants: countDescendants(page.id),
                  })
                }
                className="p-1.5 rounded-lg transition-colors"
                style={{ color: "var(--admin-text-faint)" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background =
                    "color-mix(in srgb, #ef4444 10%, var(--admin-card-bg))";
                  e.currentTarget.style.color = "#ef4444";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "var(--admin-text-faint)";
                }}>
                <Trash2 size={13} />
              </button>
            </Tooltip>
          )}
        </div>
      </div>

      {(isExpanded || searchActive) && (
        <div style={{ marginLeft: `${indent + 20}px` }}>
          <div className="space-y-1.5 mt-1.5">
            {pagedChildren.map((child) => (
              <PageRow
                key={child.id}
                page={child}
                allPages={allPages}
                templates={templates}
                depth={0}
                expandedIds={expandedIds}
                toggleExpand={toggleExpand}
                onEdit={onEdit}
                onDeleteRequest={onDeleteRequest}
                onNewChild={onNewChild}
                onToggleStatus={onToggleStatus}
                pendingToggleId={pendingToggleId}
                searchActive={searchActive}
                appDomain={appDomain}
              />
            ))}
          </div>
          {needsPagination && !searchActive && (
            <ChildPaginator
              total={allChildren.length}
              page={childPage}
              totalPages={totalPages}
              search={childSearch}
              searchResults={isChildSearching ? filteredChildren.length : null}
              onSearch={(v) => { setChildSearch(v); setChildPage(1); }}
              onPrev={() => setChildPage((p) => Math.max(1, p - 1))}
              onNext={() => setChildPage((p) => Math.min(totalPages, p + 1))}
            />
          )}
        </div>
      )}
    </>
  );
}

// ─── PageTreeView ─────────────────────────────────────────────────────────────
/** Renders a filtered subset of pages as a tree, with its own search bar. */
function PageTreeView({
  allPagesInTab,
  templates,
  expandedIds,
  toggleExpand,
  pendingToggleId,
  appDomain,
  onEdit,
  onDeleteRequest,
  onNewChild,
  onToggleStatus,
  emptyLabel,
  emptyHint,
  showNewButton,
  onNewPage,
}: {
  allPagesInTab: Page[];
  templates: TemplateWithFields[];
  expandedIds: Set<number>;
  toggleExpand: (id: number) => void;
  pendingToggleId: number | null;
  appDomain: string;
  onEdit: (id: number) => void;
  onDeleteRequest: (target: DeleteTarget) => void;
  onNewChild: (id: number) => void;
  onToggleStatus: (id: number, status: string) => void;
  emptyLabel: string;
  emptyHint?: string;
  showNewButton: boolean;
  onNewPage: () => void;
}) {
  const t = useTranslations("admin.content.pages.manager");
  const [search, setSearch] = useState("");
  const searchActive = search.trim().length > 0;

  const visiblePages: Page[] = searchActive
    ? (() => {
        const q = search.toLowerCase();
        const matched = new Set(
          allPagesInTab
            .filter((p) => p.title.toLowerCase().includes(q) || p.slug.includes(q))
            .map((p) => p.id),
        );
        const toShow = new Set(matched);
        for (const page of allPagesInTab) {
          if (!matched.has(page.id)) continue;
          let cur: Page | undefined = page;
          while (cur?.parentId) {
            toShow.add(cur.parentId);
            cur = allPagesInTab.find((p) => p.id === cur!.parentId);
          }
        }
        return allPagesInTab.filter((p) => toShow.has(p.id));
      })()
    : allPagesInTab;

  const visibleIds = new Set(visiblePages.map((p) => p.id));
  const rootPages = visiblePages.filter(
    (p) => !p.parentId || !visibleIds.has(p.parentId),
  );

  return (
    <>
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: "var(--admin-text-faint)" }}
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="w-full pl-8 pr-3 py-2 text-sm rounded-lg focus:outline-none transition-colors"
            style={{
              background: "var(--admin-page-bg)",
              border: "1px solid var(--admin-input-border)",
              color: "var(--admin-text)",
            }}
          />
        </div>
        {showNewButton && (
          <button
            onClick={onNewPage}
            className="flex items-center gap-2 px-4 py-2 text-sm text-white rounded-lg font-medium transition-colors"
            style={{ background: "var(--admin-accent)" }}
            onMouseEnter={(e) => (e.currentTarget.style.filter = "brightness(0.9)")}
            onMouseLeave={(e) => (e.currentTarget.style.filter = "none")}>
            <Plus size={15} /> {t("newPageButton")}
          </button>
        )}
      </div>

      {/* Tree */}
      {rootPages.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <FileText size={36} className="mb-3" style={{ color: "var(--admin-text-faint)" }} />
          <p className="text-sm font-medium" style={{ color: "var(--admin-text-muted)" }}>
            {searchActive ? t("searchEmptyLabel") : emptyLabel}
          </p>
          {!searchActive && emptyHint && (
            <p className="text-xs mt-1" style={{ color: "var(--admin-text-faint)" }}>
              {emptyHint}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-1.5">
          {rootPages.map((page) => (
            <PageRow
              key={page.id}
              page={page}
              allPages={visiblePages}
              templates={templates}
              depth={0}
              expandedIds={expandedIds}
              toggleExpand={toggleExpand}
              onEdit={onEdit}
              onDeleteRequest={onDeleteRequest}
              onNewChild={onNewChild}
              onToggleStatus={onToggleStatus}
              pendingToggleId={pendingToggleId}
              searchActive={searchActive}
              appDomain={appDomain}
            />
          ))}
        </div>
      )}
    </>
  );
}

// ─── PageManager ──────────────────────────────────────────────────────────────
export default function PageManager({
  initialPages,
  templates,
  appDomain,
}: {
  initialPages: Page[];
  templates: TemplateWithFields[];
  appDomain: string;
}) {
  const t = useTranslations("admin.content.pages.manager");
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<PagesTab>("user");
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [pendingToggleId, setPendingToggleId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [, startTransition] = useTransition();

  const [pickerParent, setPickerParent] = useState<Page | null>(null);
  const [pickerOptions, setPickerOptions] = useState<TemplateWithFields[]>([]);

  // Split pages into the two groups
  const userPages = initialPages.filter((p) => !p.isSystem);
  const systemPages = initialPages.filter((p) => p.isSystem);

  const userCount = userPages.length;
  const systemCount = systemPages.length;

  function toggleExpand(id: number) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    await deletePageAction(deleteTarget.slug);
    setDeleteLoading(false);
    setDeleteTarget(null);
    startTransition(() => router.refresh());
  }

  function handleToggleStatus(id: number, currentStatus: string) {
    setPendingToggleId(id);
    startTransition(async () => {
      await togglePageStatusAction(id, currentStatus);
      router.refresh();
      setPendingToggleId(null);
    });
  }

  function handleNewChild(parentId: number) {
    const parent = initialPages.find((p) => p.id === parentId);
    if (!parent) {
      router.push(`${getAdminPath("content-pages")}/new?parentId=${parentId}`);
      return;
    }
    const parentTemplate = parent.templateId
      ? templates.find((t) => t.id === parent.templateId)
      : undefined;
    const allowedIds = getAllowedChildIds(parentTemplate);
    if (allowedIds.length === 0) {
      router.push(`${getAdminPath("content-pages")}/new?parentId=${parentId}`);
      return;
    }
    if (allowedIds.length === 1) {
      router.push(
        `${getAdminPath("content-pages")}/new?parentId=${parentId}&templateId=${allowedIds[0]}&templateLocked=1`,
      );
      return;
    }
    const options = templates.filter((t) => allowedIds.includes(t.id));
    setPickerParent(parent);
    setPickerOptions(options);
  }

  function handlePickerSelect(templateId: number) {
    if (!pickerParent) return;
    setPickerParent(null);
    router.push(
      `${getAdminPath("content-pages")}/new?parentId=${pickerParent.id}&templateId=${templateId}&templateLocked=1`,
    );
  }

  function buildDeleteMessage(target: DeleteTarget): React.ReactNode {
    return (
      <span>
        {t("deleteIntroBefore")}{" "}
        <strong style={{ color: "var(--admin-text, #cdccca)" }}>
          {target.title}
        </strong>{" "}
        {t("deleteIntroSlugWrap")}
        <code style={{ fontSize: "12px" }}>/{target.slug}</code>
        {t("deleteIntroSlugClose")}
        {target.descendants > 0 && (
          <>
            <br />
            <br />
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 10px",
                borderRadius: "8px",
                background: "rgba(220,38,38,0.1)",
                color: "#f87171",
                fontSize: "13px",
                fontWeight: 500,
              }}>
              ⚠️ {t("deleteCascadeWarning", { count: target.descendants })}
            </span>
          </>
        )}
        <br />
        <br />
        <span style={{ fontSize: "13px" }}>
          {t("deleteIrreversibleBefore")}{" "}
          <strong>{t("deleteIrreversibleStrong")}</strong>
          {t("deleteIrreversibleAfter")}
        </span>
      </span>
    );
  }

  const tabBase: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    paddingInline: "14px",
    paddingBlock: "7px",
    fontSize: "13px",
    fontWeight: 500,
    borderRadius: "8px",
    border: "1px solid transparent",
    cursor: "pointer",
    transition: "all 160ms ease",
    background: "transparent",
  };

  const tabActive: React.CSSProperties = {
    background: "color-mix(in srgb, var(--admin-accent) 12%, var(--admin-card-bg))",
    borderColor: "color-mix(in srgb, var(--admin-accent) 30%, transparent)",
    color: "var(--admin-accent)",
  };

  const tabInactive: React.CSSProperties = {
    color: "var(--admin-text-muted)",
  };

  return (
    <>
      {/* Tab bar */}
      <div
        className="flex items-center gap-1 mb-5 p-1 rounded-xl"
        style={{
          background: "var(--admin-page-bg)",
          border: "1px solid var(--admin-card-border)",
          width: "fit-content",
        }}>
        <button
          type="button"
          onClick={() => { setActiveTab("user"); setExpandedIds(new Set()); }}
          style={activeTab === "user" ? { ...tabBase, ...tabActive } : { ...tabBase, ...tabInactive }}
          onMouseEnter={(e) => { if (activeTab !== "user") e.currentTarget.style.color = "var(--admin-text)"; }}
          onMouseLeave={(e) => { if (activeTab !== "user") e.currentTarget.style.color = "var(--admin-text-muted)"; }}>
          <FileText size={13} />
          {t("tabUser")}
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minWidth: "18px",
              height: "18px",
              padding: "0 5px",
              borderRadius: "9999px",
              fontSize: "11px",
              fontWeight: 600,
              background: activeTab === "user"
                ? "color-mix(in srgb, var(--admin-accent) 20%, var(--admin-card-bg))"
                : "color-mix(in srgb, var(--admin-text-faint) 18%, var(--admin-page-bg))",
              color: activeTab === "user" ? "var(--admin-accent)" : "var(--admin-text-faint)",
            }}>
            {userCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => { setActiveTab("system"); setExpandedIds(new Set()); }}
          style={activeTab === "system" ? { ...tabBase, ...tabActive } : { ...tabBase, ...tabInactive }}
          onMouseEnter={(e) => { if (activeTab !== "system") e.currentTarget.style.color = "var(--admin-text)"; }}
          onMouseLeave={(e) => { if (activeTab !== "system") e.currentTarget.style.color = "var(--admin-text-muted)"; }}>
          <Lock size={13} />
          {t("tabSystem")}
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minWidth: "18px",
              height: "18px",
              padding: "0 5px",
              borderRadius: "9999px",
              fontSize: "11px",
              fontWeight: 600,
              background: activeTab === "system"
                ? "color-mix(in srgb, var(--admin-accent) 20%, var(--admin-card-bg))"
                : "color-mix(in srgb, var(--admin-text-faint) 18%, var(--admin-page-bg))",
              color: activeTab === "system" ? "var(--admin-accent)" : "var(--admin-text-faint)",
            }}>
            {systemCount}
          </span>
        </button>
      </div>

      {/* Tab content */}
      {activeTab === "user" && (
        <PageTreeView
          allPagesInTab={userPages}
          templates={templates}
          expandedIds={expandedIds}
          toggleExpand={toggleExpand}
          pendingToggleId={pendingToggleId}
          appDomain={appDomain}
          onEdit={(id) => router.push(`${getAdminPath("content-pages")}/${id}/edit`)}
          onDeleteRequest={setDeleteTarget}
          onNewChild={handleNewChild}
          onToggleStatus={handleToggleStatus}
          emptyLabel={t("emptyUserLabel")}
          emptyHint={t("emptyUserHint")}
          showNewButton={true}
          onNewPage={() => router.push(`${getAdminPath("content-pages")}/new`)}
        />
      )}

      {activeTab === "system" && (
        <PageTreeView
          allPagesInTab={systemPages}
          templates={templates}
          expandedIds={expandedIds}
          toggleExpand={toggleExpand}
          pendingToggleId={pendingToggleId}
          appDomain={appDomain}
          onEdit={(id) => router.push(`${getAdminPath("content-pages")}/${id}/edit`)}
          onDeleteRequest={setDeleteTarget}
          onNewChild={handleNewChild}
          onToggleStatus={handleToggleStatus}
          emptyLabel={t("emptySystemLabel")}
          emptyHint={t("emptySystemHint")}
          showNewButton={false}
          onNewPage={() => {}}
        />
      )}

      {pickerParent && (
        <ChildTemplatePicker
          parentTitle={pickerParent.title}
          options={pickerOptions}
          onSelect={handlePickerSelect}
          onCancel={() => setPickerParent(null)}
        />
      )}

      {deleteTarget && (
        <ConfirmModal
          open={!!deleteTarget}
          title={t("deleteTitle")}
          message={buildDeleteMessage(deleteTarget)}
          confirmLabel={t("deleteConfirm")}
          cancelLabel={t("deleteCancel")}
          variant="danger"
          loading={deleteLoading}
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </>
  );
}
