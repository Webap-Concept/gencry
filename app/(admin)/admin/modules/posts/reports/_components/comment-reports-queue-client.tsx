"use client";
// app/(admin)/admin/modules/posts/reports/_components/comment-reports-queue-client.tsx
//
// Mirror di reports-queue-client.tsx ma operante sui COMMENT REPORTS
// (schema polymorphic posts_reports + comment_id, vedi M_posts_010).
// La decisione "actioned" qui soft-deleta il COMMENTO (non il post che
// lo contiene). La preview header mostra "Commento di @x su /post/y".
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AdminDialog,
  AdminDialogCancelButton,
  AdminDialogConfirmButton,
  AdminDialogContent,
} from "@/app/(admin)/admin/_components/admin-dialog";
import { AlertOctagon, CheckCircle2, ExternalLink, Flag } from "lucide-react";
import { AdminButton } from "@/app/(admin)/admin/_components/admin-button";
import { useResetableListState } from "@/lib/hooks/use-resetable-list-state";
import type {
  CommentReportQueueGroupRow,
  CommentReportsQueuePage,
  ReportQueueAggregateStatus,
  ReportQueueStatus,
} from "@/lib/modules/posts/queries";
import {
  loadMoreCommentReportsAction,
  reviewCommentReportAction,
} from "../actions";

const STATUS_TABS: { key: ReportQueueStatus; label: string }[] = [
  { key: "open", label: "Aperti" },
  { key: "reviewed", label: "Esaminati" },
  { key: "dismissed", label: "Respinti" },
  { key: "actioned", label: "Action presi" },
  { key: "all", label: "Tutti" },
];

const STATUS_BADGE: Record<
  ReportQueueAggregateStatus,
  { label: string; bg: string; fg: string }
> = {
  open: { label: "Aperto", bg: "#f59e0b22", fg: "#b45309" },
  reviewed: { label: "Esaminato", bg: "var(--admin-hover-bg)", fg: "var(--admin-text-muted)" },
  dismissed: { label: "Respinto", bg: "var(--admin-hover-bg)", fg: "var(--admin-text-faint)" },
  actioned: { label: "Action", bg: "#dc262622", fg: "#dc2626" },
};

function formatRelativeTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diffMs = Date.now() - d.getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return "ora";
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86_400) return `${Math.floor(sec / 3600)}h`;
  if (sec < 604_800) return `${Math.floor(sec / 86_400)}g`;
  return d.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
}

function reasonLabelOf(key: string, labels: Record<string, string>): string {
  return labels[key] ?? key;
}

export function CommentReportsQueueClient({
  initial,
  status,
  reasonLabels,
}: {
  initial: CommentReportsQueuePage;
  status: ReportQueueStatus;
  reasonLabels: Record<string, string>;
}) {
  const [selected, setSelected] = useState<CommentReportQueueGroupRow | null>(
    null,
  );
  const { rows, cursor, appendRows } = useResetableListState(initial);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoadingMore, startLoadMore] = useTransition();

  const loadMore = () => {
    if (!cursor) return;
    setLoadError(null);
    const cur = cursor;
    startLoadMore(async () => {
      const res = await loadMoreCommentReportsAction({ status, cursor: cur });
      if (!res.ok) {
        setLoadError(res.error);
        return;
      }
      appendRows(res.rows, res.nextCursor);
    });
  };

  return (
    <div className="space-y-4">
      <div
        className="flex flex-wrap items-center gap-1 p-1 rounded-xl w-fit"
        style={{ background: "var(--admin-hover-bg)" }}>
        {STATUS_TABS.map((tab) => {
          const isActive = tab.key === status;
          const count =
            tab.key === "all"
              ? Object.values(initial.countByStatus).reduce((a, b) => a + b, 0)
              : initial.countByStatus[tab.key];
          return (
            <Link
              key={tab.key}
              href={`?kind=comment&status=${tab.key}`}
              className="flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-lg font-medium transition-all"
              style={{
                background: isActive ? "var(--admin-accent)" : "transparent",
                color: isActive ? "#fff" : "var(--admin-text-muted)",
                boxShadow: isActive
                  ? "0 1px 3px oklch(0 0 0 / 0.15)"
                  : "none",
              }}>
              {tab.label}
              <span
                className="text-[11px] font-semibold px-1.5 rounded"
                style={{
                  background: isActive
                    ? "oklch(1 0 0 / 0.18)"
                    : "var(--admin-card-bg)",
                  color: isActive ? "#fff" : "var(--admin-text-faint)",
                }}>
                {count}
              </span>
            </Link>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <div
          className="rounded-xl p-12 text-center"
          style={{
            background: "var(--admin-card-bg)",
            border: "1px dashed var(--admin-card-border)",
            color: "var(--admin-text-faint)",
          }}>
          <p className="text-sm">Nessun commento segnalato in questo stato.</p>
        </div>
      ) : (
        <>
          <ul className="space-y-2">
            {rows.map((row) => (
              <GroupRow
                key={row.comment.id}
                row={row}
                reasonLabels={reasonLabels}
                onClick={() => setSelected(row)}
              />
            ))}
          </ul>
          {cursor ? (
            <div className="flex flex-col items-center gap-1.5 pt-2">
              <AdminButton
                variant="secondary"
                size="md"
                loading={isLoadingMore}
                onClick={loadMore}>
                {isLoadingMore ? "Caricamento…" : "Carica altre"}
              </AdminButton>
              {loadError ? (
                <p
                  className="text-xs"
                  style={{ color: "var(--gc-neg, #dc2626)" }}>
                  {loadError}
                </p>
              ) : null}
            </div>
          ) : null}
        </>
      )}

      {selected ? (
        <ReviewDialog
          row={selected}
          reasonLabels={reasonLabels}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </div>
  );
}

function GroupRow({
  row,
  reasonLabels,
  onClick,
}: {
  row: CommentReportQueueGroupRow;
  reasonLabels: Record<string, string>;
  onClick: () => void;
}) {
  const badge = STATUS_BADGE[row.aggregateStatus];
  const reasonsList = Object.entries(row.reasonsBreakdown)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  const moreReasons = Object.keys(row.reasonsBreakdown).length - reasonsList.length;

  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="w-full text-left rounded-xl p-4 transition-colors"
        style={{
          background: "var(--admin-card-bg)",
          border: "1px solid var(--admin-card-border)",
        }}
        onMouseEnter={(e) =>
          (e.currentTarget.style.background = "var(--admin-hover-bg)")
        }
        onMouseLeave={(e) =>
          (e.currentTarget.style.background = "var(--admin-card-bg)")
        }>
        <div className="flex items-start gap-3">
          <div className="shrink-0 flex -space-x-2">
            {row.recentReporters.slice(0, 3).map((r, i) =>
              r.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={r.id}
                  src={r.avatarUrl}
                  alt=""
                  className="w-9 h-9 rounded-full object-cover ring-2"
                  style={{
                    ringColor: "var(--admin-card-bg)",
                    zIndex: 10 - i,
                  } as React.CSSProperties}
                />
              ) : (
                <div
                  key={r.id}
                  className="w-9 h-9 rounded-full flex items-center justify-center text-xs ring-2"
                  style={{
                    background: "var(--admin-hover-bg)",
                    color: "var(--admin-text-muted)",
                    ringColor: "var(--admin-card-bg)",
                    zIndex: 10 - i,
                  } as React.CSSProperties}>
                  {(r.username ?? "?")[0]?.toUpperCase()}
                </div>
              ),
            )}
            {row.recentReporters.length === 0 ? (
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center"
                style={{
                  background: "var(--admin-hover-bg)",
                  color: "var(--admin-text-faint)",
                }}
                aria-hidden>
                <Flag size={14} />
              </div>
            ) : null}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-baseline gap-2">
              <span
                className="text-sm font-medium"
                style={{ color: "var(--admin-text)" }}>
                Commento di @
                {row.comment.author.username ?? row.comment.authorId.slice(0, 8)}
              </span>
              <span
                className="text-xs"
                style={{ color: "var(--admin-text-faint)" }}>
                segnalato {row.totalReports}{" "}
                {row.totalReports === 1 ? "volta" : "volte"} — ultima{" "}
                {formatRelativeTime(row.lastReportedAt)}
              </span>
              {row.comment.deletedAt ? (
                <span
                  className="text-[11px] font-medium px-2 py-0.5 rounded"
                  style={{
                    background:
                      "color-mix(in srgb, #6b7280 14%, transparent)",
                    color: "#6b7280",
                  }}>
                  Commento già cancellato
                </span>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {reasonsList.map(([key, n]) => (
                <span
                  key={key}
                  className="text-[11px] font-medium px-2 py-0.5 rounded"
                  style={{
                    background:
                      "color-mix(in srgb, var(--admin-accent) 14%, transparent)",
                    color: "var(--admin-accent)",
                  }}>
                  {n}× {reasonLabelOf(key, reasonLabels)}
                </span>
              ))}
              {moreReasons > 0 ? (
                <span
                  className="text-[11px] px-2 py-0.5 rounded"
                  style={{
                    background: "var(--admin-hover-bg)",
                    color: "var(--admin-text-faint)",
                  }}>
                  +{moreReasons}
                </span>
              ) : null}
            </div>
            <p
              className="text-sm mt-2 line-clamp-2"
              style={{ color: "var(--admin-text)" }}>
              {row.comment.body || (
                <em style={{ color: "var(--admin-text-faint)" }}>
                  (commento vuoto)
                </em>
              )}
            </p>
            <p
              className="text-[11px] mt-1.5"
              style={{ color: "var(--admin-text-faint)" }}>
              {row.openCount > 0 ? (
                <strong style={{ color: "#b45309" }}>
                  {row.openCount} aperte
                </strong>
              ) : (
                <>tutte processate</>
              )}
              {" · "}prima segnalazione{" "}
              {formatRelativeTime(row.firstReportedAt)}
              {" · "}
              <Link
                href={`/post/${row.comment.postId}#comment-${row.comment.id}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 underline hover:no-underline"
                onClick={(e) => e.stopPropagation()}>
                Apri post <ExternalLink size={10} />
              </Link>
            </p>
          </div>
          <span
            className="text-[10px] uppercase tracking-wider px-2 py-1 rounded font-semibold shrink-0"
            style={{ background: badge.bg, color: badge.fg }}>
            {badge.label}
          </span>
        </div>
      </button>
    </li>
  );
}

function ReviewDialog({
  row,
  reasonLabels,
  onClose,
}: {
  row: CommentReportQueueGroupRow;
  reasonLabels: Record<string, string>;
  onClose: () => void;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [isSubmitting, startSubmit] = useTransition();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const noOpenLeft = row.openCount === 0;
  const alreadyDeleted = !!row.comment.deletedAt;

  const submit = (decision: "dismissed" | "actioned") => {
    setSubmitError(null);
    startSubmit(async () => {
      const res = await reviewCommentReportAction({
        commentId: row.comment.id,
        decision,
        note: note.trim() || null,
      });
      if (res.ok) {
        onClose();
        router.refresh();
      } else {
        setSubmitError(res.error);
      }
    });
  };

  const reasonsSorted = Object.entries(row.reasonsBreakdown).sort(
    (a, b) => b[1] - a[1],
  );

  return (
    <AdminDialog open onOpenChange={(o) => !o && onClose()}>
      <AdminDialogContent
        icon={Flag}
        size="xl"
        title={`Revisione commento: ${row.totalReports} segnalazion${row.totalReports === 1 ? "e" : "i"}`}
        description="La decisione si applica a tutte le segnalazioni aperte del commento. 'Action' soft-deleta il commento (NON il post che lo contiene)."
        footer={
          <>
            <AdminDialogCancelButton onClick={onClose} disabled={isSubmitting}>
              Chiudi
            </AdminDialogCancelButton>
            {!noOpenLeft ? (
              <>
                <AdminDialogConfirmButton
                  onClick={() => submit("dismissed")}
                  disabled={isSubmitting}
                  loading={isSubmitting}
                  icon={CheckCircle2}>
                  Respingi tutte
                </AdminDialogConfirmButton>
                <AdminDialogConfirmButton
                  variant="danger"
                  onClick={() => submit("actioned")}
                  disabled={isSubmitting}
                  loading={isSubmitting}
                  icon={AlertOctagon}>
                  {alreadyDeleted
                    ? "Conferma action su tutte"
                    : "Soft-delete commento + action"}
                </AdminDialogConfirmButton>
              </>
            ) : null}
          </>
        }>
        <div className="space-y-3">
          <div
            className="rounded-lg p-4"
            style={{
              background: "var(--admin-page-bg)",
              border: "1px solid var(--admin-card-border)",
            }}>
            <p
              className="text-[11px] uppercase tracking-wider mb-2 flex items-center gap-2"
              style={{ color: "var(--admin-text-faint)" }}>
              <span>
                Commento di @
                {row.comment.author.username ??
                  row.comment.authorId.slice(0, 8)}
              </span>
              <Link
                href={`/post/${row.comment.postId}#comment-${row.comment.id}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 underline hover:no-underline normal-case">
                Apri post <ExternalLink size={10} />
              </Link>
            </p>
            <p
              className="text-sm whitespace-pre-wrap"
              style={{ color: "var(--admin-text)" }}>
              {row.comment.body || (
                <em style={{ color: "var(--admin-text-faint)" }}>
                  (commento vuoto)
                </em>
              )}
            </p>
          </div>

          <div
            className="grid grid-cols-4 gap-2 rounded-lg p-3"
            style={{
              background: "var(--admin-card-bg)",
              border: "1px solid var(--admin-card-border)",
            }}>
            <Stat label="Totale" value={row.totalReports} />
            <Stat label="Aperte" value={row.openCount} accent={row.openCount > 0} />
            <Stat label="Respinte" value={row.dismissedCount} />
            <Stat label="Action" value={row.actionedCount} />
          </div>

          {reasonsSorted.length > 0 ? (
            <div
              className="rounded-lg p-3"
              style={{
                background: "var(--admin-card-bg)",
                border: "1px solid var(--admin-card-border)",
              }}>
              <p
                className="text-[11px] uppercase tracking-wider mb-2"
                style={{ color: "var(--admin-text-faint)" }}>
                Motivi (ordinati per frequenza)
              </p>
              <div className="flex flex-wrap gap-1.5">
                {reasonsSorted.map(([key, n]) => (
                  <span
                    key={key}
                    className="text-xs font-medium px-2 py-1 rounded"
                    style={{
                      background:
                        "color-mix(in srgb, var(--admin-accent) 14%, transparent)",
                      color: "var(--admin-accent)",
                    }}>
                    {n}× {reasonLabelOf(key, reasonLabels)}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {row.recentReporters.length > 0 ? (
            <div
              className="rounded-lg p-3"
              style={{
                background: "var(--admin-card-bg)",
                border: "1px solid var(--admin-card-border)",
              }}>
              <p
                className="text-[11px] uppercase tracking-wider mb-2"
                style={{ color: "var(--admin-text-faint)" }}>
                Reporter recenti ({row.recentReporters.length})
              </p>
              <div className="flex flex-wrap gap-2">
                {row.recentReporters.map((r) => (
                  <span
                    key={r.id}
                    className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded"
                    style={{
                      background: "var(--admin-hover-bg)",
                      color: "var(--admin-text-muted)",
                    }}>
                    @{r.username ?? r.id.slice(0, 8)}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {!noOpenLeft ? (
            <div>
              <label
                className="block text-[11px] uppercase tracking-wider mb-1"
                style={{ color: "var(--admin-text-faint)" }}>
                Nota interna (opzionale, audit trail su tutte le segnalazioni)
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Motivazione della decisione, visibile solo ad altri moderatori"
                rows={2}
                maxLength={2000}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{
                  background: "var(--admin-page-bg)",
                  border: "1px solid var(--admin-card-border)",
                  color: "var(--admin-text)",
                }}
              />
            </div>
          ) : (
            <p
              className="text-xs italic"
              style={{ color: "var(--admin-text-faint)" }}>
              Tutte le segnalazioni sono già state processate. Solo informazione.
            </p>
          )}

          {submitError ? (
            <p className="text-xs" style={{ color: "var(--gc-neg, #dc2626)" }}>
              Errore: {submitError}
            </p>
          ) : null}
        </div>
      </AdminDialogContent>
    </AdminDialog>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div className="text-center">
      <p
        className="text-xl font-bold"
        style={{ color: accent ? "#b45309" : "var(--admin-text)" }}>
        {value}
      </p>
      <p
        className="text-[10px] uppercase tracking-wider mt-0.5"
        style={{ color: "var(--admin-text-faint)" }}>
        {label}
      </p>
    </div>
  );
}
