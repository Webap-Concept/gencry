"use client";

import ConfirmModal from "@/app/(admin)/admin/_components/confirm-modal";
import { AdminSectionHeader } from "@/app/(admin)/admin/_components/section-header";
import type { NotFoundLogRow } from "@/lib/db/not-found-queries";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  ExternalLink,
  GitMerge,
  RotateCcw,
  SearchX,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

type NotFoundT = ReturnType<typeof useTranslations<"admin.seo.notFound">>;

type Props = {
  rows: NotFoundLogRow[];
  counts: { unresolved: number; resolved: number };
  includeResolved: boolean;
  resolveAction: (
    id: number,
  ) => Promise<{ error?: string; success?: boolean }>;
  reopenAction: (
    id: number,
  ) => Promise<{ error?: string; success?: boolean }>;
  deleteAction: (
    id: number,
  ) => Promise<{ error?: string; success?: boolean }>;
  clearResolvedAction: () => Promise<{
    error?: string;
    success?: boolean;
    cleared?: number;
  }>;
};

type DeleteTarget = { id: number; path: string };

function makeFormatRelative(t: NotFoundT) {
  return (date: Date | string): string => {
    const d = typeof date === "string" ? new Date(date) : date;
    const diffMs = Date.now() - d.getTime();
    const sec = Math.round(diffMs / 1000);
    if (sec < 60) return t("relativeSec", { sec });
    const min = Math.round(sec / 60);
    if (min < 60) return t("relativeMin", { min });
    const hr = Math.round(min / 60);
    if (hr < 24) return t("relativeHr", { hr });
    const day = Math.round(hr / 24);
    if (day < 30) return t("relativeDay", { day });
    return d.toLocaleDateString();
  };
}

export default function NotFoundClient({
  rows,
  counts,
  includeResolved,
  resolveAction,
  reopenAction,
  deleteAction,
  clearResolvedAction,
}: Props) {
  const t = useTranslations("admin.seo.notFound");
  const formatRelative = makeFormatRelative(t);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function setShowAll(showAll: boolean) {
    const params = new URLSearchParams(searchParams.toString());
    if (showAll) params.set("show", "all");
    else params.delete("show");
    const qs = params.toString();
    router.push(qs ? `?${qs}` : "?");
  }

  async function runAction(
    id: number,
    fn: (id: number) => Promise<{ error?: string; success?: boolean }>,
  ) {
    setPendingId(id);
    setActionError(null);
    const res = await fn(id);
    setPendingId(null);
    if (res.error) setActionError(res.error);
    else startTransition(() => router.refresh());
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    await runAction(deleteTarget.id, deleteAction);
    setDeleteTarget(null);
  }

  async function confirmClearResolved() {
    setActionError(null);
    const res = await clearResolvedAction();
    setClearOpen(false);
    if (res.error) setActionError(res.error);
    else startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-6">
      <ConfirmModal
        open={deleteTarget !== null}
        title={t("deleteModalTitle")}
        message={
          <>
            {t("deleteModalIntroBefore")}{" "}
            <code
              style={{
                fontFamily: "monospace",
                fontSize: "0.8rem",
                padding: "1px 5px",
                borderRadius: "4px",
                background: "var(--admin-page-bg)",
                color: "var(--admin-text)",
              }}>
              {deleteTarget?.path}
            </code>
            {t("deleteModalIntroAfter")}
            <br />
            <span style={{ marginTop: "6px", display: "block" }}>
              {t("deleteModalCascade")}
            </span>
          </>
        }
        variant="danger"
        confirmLabel={t("deleteModalConfirm")}
        cancelLabel={t("deleteModalCancel")}
        loading={pendingId === deleteTarget?.id}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmModal
        open={clearOpen}
        title={t("clearModalTitle")}
        message={t.rich("clearModalBody", {
          count: counts.resolved,
          strong: (chunks) => <strong>{chunks}</strong>,
        })}
        variant="warning"
        confirmLabel={t("clearModalConfirm")}
        cancelLabel={t("clearModalCancel")}
        onConfirm={confirmClearResolved}
        onCancel={() => setClearOpen(false)}
      />

      <AdminSectionHeader
        icon={SearchX}
        breadcrumbLabel={t("pageHeading")}
        subtitle={t("countsLine", {
          unresolved: counts.unresolved,
          resolved: counts.resolved,
        })}
        actionSlot={
          <div className="flex items-center gap-2">
            <div
              className="flex items-center rounded-lg p-0.5"
              style={{
                background: "var(--admin-page-bg)",
                border: "1px solid var(--admin-card-border)",
              }}>
              <button
                type="button"
                onClick={() => setShowAll(false)}
                className="px-3 py-1 text-xs font-medium rounded-md transition-colors"
                style={{
                  background: !includeResolved
                    ? "var(--admin-card-bg)"
                    : "transparent",
                  color: !includeResolved
                    ? "var(--admin-text)"
                    : "var(--admin-text-muted)",
                }}>
                {t("filterUnresolved")}
              </button>
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="px-3 py-1 text-xs font-medium rounded-md transition-colors"
                style={{
                  background: includeResolved
                    ? "var(--admin-card-bg)"
                    : "transparent",
                  color: includeResolved
                    ? "var(--admin-text)"
                    : "var(--admin-text-muted)",
                }}>
                {t("filterAll")}
              </button>
            </div>
            {counts.resolved > 0 && (
              <button
                type="button"
                onClick={() => setClearOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors"
                style={{
                  color: "var(--admin-text-muted)",
                  border: "1px solid var(--admin-card-border)",
                  background: "var(--admin-card-bg)",
                }}>
                <Trash2 size={13} /> {t("clearResolvedButton")}
              </button>
            )}
          </div>
        }
      />

      {actionError && (
        <div
          className="flex items-center gap-2 rounded-lg px-3 py-2"
          style={{
            background:
              "color-mix(in srgb, #ef4444 8%, var(--admin-card-bg))",
            border:
              "1px solid color-mix(in srgb, #ef4444 25%, transparent)",
          }}>
          <AlertTriangle size={14} style={{ color: "#ef4444" }} />
          <p className="text-sm" style={{ color: "#ef4444" }}>
            {actionError}
          </p>
        </div>
      )}

      {/* List */}
      {rows.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center py-16 text-center rounded-xl"
          style={{
            background: "var(--admin-card-bg)",
            border: "1px solid var(--admin-card-border)",
          }}>
          <SearchX
            size={32}
            className="mb-3"
            style={{ color: "var(--admin-text-faint)" }}
          />
          <p
            className="text-sm font-medium"
            style={{ color: "var(--admin-text-muted)" }}>
            {t("emptyTitle")}
          </p>
          <p
            className="text-xs mt-1 max-w-sm"
            style={{ color: "var(--admin-text-faint)" }}>
            {t("emptyHint")}
          </p>
        </div>
      ) : (
        <div
          className="rounded-xl overflow-hidden"
          style={{
            background: "var(--admin-card-bg)",
            border: "1px solid var(--admin-card-border)",
          }}>
          <div
            className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide"
            style={{
              color: "var(--admin-text-faint)",
              borderBottom: "1px solid var(--admin-divider)",
              background: "var(--admin-page-bg)",
            }}>
            <span>{t("columnPath")}</span>
            <span>{t("columnHits")}</span>
            <span>{t("columnLastHit")}</span>
            <span />
          </div>

          {rows.map((row, i) => {
            const resolved = row.resolvedAt !== null;
            const busy = pendingId === row.id;
            return (
              <div
                key={row.id}
                className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 px-4 py-3 text-sm"
                style={{
                  borderBottom:
                    i < rows.length - 1
                      ? "1px solid var(--admin-divider)"
                      : "none",
                  background: resolved
                    ? "color-mix(in srgb, #22c55e 4%, var(--admin-card-bg))"
                    : "transparent",
                  opacity: resolved ? 0.75 : 1,
                }}>
                <div className="min-w-0 flex flex-col gap-0.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <code
                      className="text-xs font-mono truncate"
                      style={{
                        color: resolved
                          ? "var(--admin-text-muted)"
                          : "var(--admin-text)",
                      }}
                      title={row.path}>
                      {row.path}
                    </code>
                    <a
                      href={row.path}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={t("openInNewTabTooltip")}
                      className="flex-shrink-0 p-0.5 rounded transition-colors"
                      style={{ color: "var(--admin-text-faint)" }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.color = "var(--admin-accent)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.color =
                          "var(--admin-text-faint)")
                      }>
                      <ExternalLink size={11} />
                    </a>
                  </div>
                  {row.lastReferrer && (
                    <p
                      className="text-[0.65rem] truncate"
                      style={{ color: "var(--admin-text-faint)" }}
                      title={t("referrerPrefix", { ref: row.lastReferrer })}>
                      {t("referrerPrefix", { ref: row.lastReferrer })}
                    </p>
                  )}
                </div>

                <span
                  className="text-xs font-mono font-semibold px-2 py-0.5 rounded-full"
                  style={{
                    background: "var(--admin-page-bg)",
                    color: "var(--admin-text)",
                    border: "1px solid var(--admin-card-border)",
                    minWidth: "2.5rem",
                    textAlign: "center",
                  }}>
                  {row.hitCount}
                </span>

                <span
                  className="text-xs whitespace-nowrap"
                  style={{ color: "var(--admin-text-muted)" }}
                  title={new Date(row.lastHitAt).toLocaleString()}>
                  {formatRelative(row.lastHitAt)}
                </span>

                <div className="flex items-center gap-1">
                  <Link
                    href={`/admin/seo/redirect?from=${encodeURIComponent(row.path)}`}
                    title={t("redirectActionTooltip")}
                    className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md transition-colors"
                    style={{
                      color: "var(--admin-accent)",
                      border:
                        "1px solid color-mix(in srgb, var(--admin-accent) 35%, transparent)",
                      background:
                        "color-mix(in srgb, var(--admin-accent) 8%, transparent)",
                    }}>
                    <GitMerge size={12} />
                    {t("redirectActionLabel")}
                    <ArrowUpRight size={11} />
                  </Link>

                  {resolved ? (
                    <button
                      type="button"
                      title={t("reopenTooltip")}
                      disabled={busy}
                      onClick={() => runAction(row.id, reopenAction)}
                      className="p-1.5 rounded transition-colors disabled:opacity-40"
                      style={{ color: "var(--admin-text-muted)" }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.color = "var(--admin-accent)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.color =
                          "var(--admin-text-muted)")
                      }>
                      {busy ? (
                        <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin block" />
                      ) : (
                        <RotateCcw size={13} />
                      )}
                    </button>
                  ) : (
                    <button
                      type="button"
                      title={t("resolveTooltip")}
                      disabled={busy}
                      onClick={() => runAction(row.id, resolveAction)}
                      className="p-1.5 rounded transition-colors disabled:opacity-40"
                      style={{ color: "var(--admin-text-muted)" }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.color = "#22c55e")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.color =
                          "var(--admin-text-muted)")
                      }>
                      {busy ? (
                        <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin block" />
                      ) : (
                        <CheckCircle2 size={13} />
                      )}
                    </button>
                  )}

                  <button
                    type="button"
                    title={t("deleteTooltip")}
                    disabled={busy}
                    onClick={() =>
                      setDeleteTarget({ id: row.id, path: row.path })
                    }
                    className="p-1.5 rounded transition-colors disabled:opacity-40"
                    style={{ color: "var(--admin-text-muted)" }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.color = "#ef4444")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.color = "var(--admin-text-muted)")
                    }>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
