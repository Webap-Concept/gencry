"use client";

import ConfirmModal from "@/app/(admin)/admin/_components/confirm-modal";
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
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

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

function formatRelative(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diffMs = Date.now() - d.getTime();
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  return d.toLocaleDateString();
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
        title="Delete entry"
        message={
          <>
            You are about to delete the 404 entry for{" "}
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
            .<br />
            <span style={{ marginTop: "6px", display: "block" }}>
              The hit history for this path will be lost. Future hits will
              create a new entry.
            </span>
          </>
        }
        variant="danger"
        confirmLabel="Delete entry"
        cancelLabel="Cancel"
        loading={pendingId === deleteTarget?.id}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmModal
        open={clearOpen}
        title="Clear resolved entries"
        message={
          <>
            All entries currently marked as <strong>resolved</strong> (
            {counts.resolved}) will be permanently deleted.
          </>
        }
        variant="warning"
        confirmLabel="Clear resolved"
        cancelLabel="Cancel"
        onConfirm={confirmClearResolved}
        onCancel={() => setClearOpen(false)}
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{
              background:
                "color-mix(in srgb, var(--admin-accent) 12%, var(--admin-card-bg))",
              border:
                "1px solid color-mix(in srgb, var(--admin-accent) 25%, transparent)",
            }}>
            <SearchX size={18} style={{ color: "var(--admin-accent)" }} />
          </div>
          <div>
            <h1
              className="text-lg font-semibold"
              style={{ color: "var(--admin-text)" }}>
              404 Monitor
            </h1>
            <p className="text-xs" style={{ color: "var(--admin-text-faint)" }}>
              {counts.unresolved} unresolved · {counts.resolved} resolved
            </p>
          </div>
        </div>
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
              Unresolved
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
              All
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
              <Trash2 size={13} /> Clear resolved
            </button>
          )}
        </div>
      </div>

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
            No 404 hits recorded
          </p>
          <p
            className="text-xs mt-1 max-w-sm"
            style={{ color: "var(--admin-text-faint)" }}>
            Each time a public URL returns 404, it&apos;s aggregated here.
            Static assets, API routes, and bot traffic are filtered out.
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
            <span>Path</span>
            <span>Hits</span>
            <span>Last hit</span>
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
                      title="Open in new tab"
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
                      title={`Last referrer: ${row.lastReferrer}`}>
                      from {row.lastReferrer}
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
                    title="Create redirect for this path"
                    className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md transition-colors"
                    style={{
                      color: "var(--admin-accent)",
                      border:
                        "1px solid color-mix(in srgb, var(--admin-accent) 35%, transparent)",
                      background:
                        "color-mix(in srgb, var(--admin-accent) 8%, transparent)",
                    }}>
                    <GitMerge size={12} />
                    Redirect
                    <ArrowUpRight size={11} />
                  </Link>

                  {resolved ? (
                    <button
                      type="button"
                      title="Reopen"
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
                      title="Mark as resolved"
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
                    title="Delete"
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
