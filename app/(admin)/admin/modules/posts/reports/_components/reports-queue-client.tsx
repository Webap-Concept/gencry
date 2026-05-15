"use client";
// app/(admin)/admin/modules/posts/reports/_components/reports-queue-client.tsx
//
// UI client della queue di moderazione. Tabs pill (open/reviewed/dismissed/
// actioned/all) via Link con searchParam ?status= (no client state per
// le tab, restano bookmark-able).
// Click su una row apre il drawer con i dettagli del post + form di
// decisione. Drawer = shadcn Dialog wide.
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, AlertOctagon, CheckCircle2 } from "lucide-react";
import type {
  ReportQueueRow,
  ReportQueueStatus,
  ReportsQueuePage,
} from "@/lib/modules/posts/queries";
import { reviewReportAction } from "../actions";

const STATUS_TABS: { key: ReportQueueStatus; label: string }[] = [
  { key: "open", label: "Aperti" },
  { key: "reviewed", label: "Esaminati" },
  { key: "dismissed", label: "Respinti" },
  { key: "actioned", label: "Action presi" },
  { key: "all", label: "Tutti" },
];

const STATUS_BADGE: Record<string, { label: string; bg: string; fg: string }> = {
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

export function ReportsQueueClient({
  initial,
  status,
  reasonLabels,
}: {
  initial: ReportsQueuePage;
  status: ReportQueueStatus;
  reasonLabels: Record<string, string>;
}) {
  const [selected, setSelected] = useState<ReportQueueRow | null>(null);

  return (
    <div className="space-y-4">
      {/* Pill tabs */}
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
              href={`?status=${tab.key}`}
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

      {/* Lista report */}
      {initial.rows.length === 0 ? (
        <div
          className="rounded-xl p-12 text-center"
          style={{
            background: "var(--admin-card-bg)",
            border: "1px dashed var(--admin-card-border)",
            color: "var(--admin-text-faint)",
          }}>
          <p className="text-sm">Nessuna segnalazione in questo stato.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {initial.rows.map((row) => (
            <ReportRow
              key={row.report.id}
              row={row}
              reasonLabel={reasonLabels[row.report.reason] ?? row.report.reason}
              onClick={() => setSelected(row)}
            />
          ))}
        </ul>
      )}

      {/* Drawer (Dialog wide) — montato solo se una row è selezionata */}
      {selected ? (
        <ReportReviewDialog
          row={selected}
          reasonLabel={reasonLabels[selected.report.reason] ?? selected.report.reason}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </div>
  );
}

function ReportRow({
  row,
  reasonLabel,
  onClick,
}: {
  row: ReportQueueRow;
  reasonLabel: string;
  onClick: () => void;
}) {
  const badge = STATUS_BADGE[row.report.status] ?? STATUS_BADGE.open;
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
          <div className="shrink-0">
            {row.reporter.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={row.reporter.avatarUrl}
                alt=""
                className="w-9 h-9 rounded-full object-cover"
              />
            ) : (
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-xs"
                style={{
                  background: "var(--admin-hover-bg)",
                  color: "var(--admin-text-muted)",
                }}>
                {(row.reporter.username ?? "?")[0]?.toUpperCase()}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-baseline gap-2">
              <span
                className="text-sm font-medium"
                style={{ color: "var(--admin-text)" }}>
                @{row.reporter.username ?? row.reporter.id.slice(0, 8)}
              </span>
              <span
                className="text-xs"
                style={{ color: "var(--admin-text-faint)" }}>
                ha segnalato — {formatRelativeTime(row.report.createdAt)}
              </span>
              <span
                className="text-[11px] font-medium px-2 py-0.5 rounded"
                style={{
                  background:
                    "color-mix(in srgb, var(--admin-accent) 14%, transparent)",
                  color: "var(--admin-accent)",
                }}>
                {reasonLabel}
              </span>
              {row.siblingOpenReports > 1 ? (
                <span
                  className="text-[11px] font-medium px-2 py-0.5 rounded"
                  style={{
                    background:
                      "color-mix(in srgb, #f59e0b 14%, transparent)",
                    color: "#b45309",
                  }}>
                  +{row.siblingOpenReports - 1} altre sullo stesso post
                </span>
              ) : null}
              {row.post.deletedAt ? (
                <span
                  className="text-[11px] font-medium px-2 py-0.5 rounded"
                  style={{
                    background:
                      "color-mix(in srgb, #6b7280 14%, transparent)",
                    color: "#6b7280",
                  }}>
                  Post già cancellato
                </span>
              ) : null}
            </div>
            <p
              className="text-sm mt-1.5 line-clamp-2"
              style={{ color: "var(--admin-text)" }}>
              {row.post.body || (
                <em style={{ color: "var(--admin-text-faint)" }}>
                  (post senza testo)
                </em>
              )}
            </p>
            <p
              className="text-[11px] mt-1.5"
              style={{ color: "var(--admin-text-faint)" }}>
              autore: @{row.post.author.username ?? row.post.authorId.slice(0, 8)}
              {row.report.details ? (
                <> · note reporter: &ldquo;{row.report.details.slice(0, 100)}&rdquo;</>
              ) : null}
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

function ReportReviewDialog({
  row,
  reasonLabel,
  onClose,
}: {
  row: ReportQueueRow;
  reasonLabel: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [isSubmitting, startSubmit] = useTransition();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const alreadyDecided =
    row.report.status === "dismissed" || row.report.status === "actioned";
  const postAlreadyDeleted = !!row.post.deletedAt;

  const submit = (decision: "dismissed" | "actioned") => {
    setSubmitError(null);
    startSubmit(async () => {
      const res = await reviewReportAction({
        reportId: row.report.id,
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

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader className="!flex-col !items-start !gap-1 !py-3">
          <DialogTitle>Revisione segnalazione</DialogTitle>
          <DialogDescription
            className="text-xs"
            style={{ color: "var(--admin-text-faint)" }}>
            Decidi come gestire la segnalazione. La decisione è registrata
            con il tuo user id e timestamp.
          </DialogDescription>
        </DialogHeader>

        <div className="px-5 py-4 space-y-3">
          {/* Post preview */}
          <div
            className="rounded-lg p-4"
            style={{
              background: "var(--admin-page-bg)",
              border: "1px solid var(--admin-card-border)",
            }}>
            <p
              className="text-[11px] uppercase tracking-wider mb-2"
              style={{ color: "var(--admin-text-faint)" }}>
              Post segnalato — @
              {row.post.author.username ?? row.post.authorId.slice(0, 8)}
            </p>
            <p className="text-sm whitespace-pre-wrap" style={{ color: "var(--admin-text)" }}>
              {row.post.body || (
                <em style={{ color: "var(--admin-text-faint)" }}>
                  (post senza testo)
                </em>
              )}
            </p>
          </div>

          {/* Report metadata */}
          <div
            className="rounded-lg p-3 text-xs space-y-1"
            style={{
              background: "var(--admin-card-bg)",
              border: "1px solid var(--admin-card-border)",
              color: "var(--admin-text-muted)",
            }}>
            <p>
              <strong>Motivo:</strong> {reasonLabel}{" "}
              <span className="font-mono opacity-60">({row.report.reason})</span>
            </p>
            <p>
              <strong>Reporter:</strong> @
              {row.reporter.username ?? row.reporter.id.slice(0, 8)}
            </p>
            <p>
              <strong>Inviato:</strong>{" "}
              {new Date(row.report.createdAt).toLocaleString("it-IT")}
            </p>
            {row.report.details ? (
              <p>
                <strong>Note reporter:</strong> {row.report.details}
              </p>
            ) : null}
            {row.siblingOpenReports > 1 ? (
              <p style={{ color: "#b45309" }}>
                <strong>+{row.siblingOpenReports - 1}</strong> altre segnalazioni
                aperte sullo stesso post.
              </p>
            ) : null}
          </div>

          {!alreadyDecided ? (
            <div>
              <label
                className="block text-[11px] uppercase tracking-wider mb-1"
                style={{ color: "var(--admin-text-faint)" }}>
                Nota interna (opzionale, audit trail)
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
              Questa segnalazione è già stata processata. Solo informazione.
            </p>
          )}

          {submitError ? (
            <p className="text-xs" style={{ color: "var(--gc-neg, #dc2626)" }}>
              Errore: {submitError}
            </p>
          ) : null}
        </div>

        <DialogFooter className="px-5 py-3 gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-3 py-1.5 rounded-lg text-sm disabled:opacity-50"
            style={{
              background: "var(--admin-hover-bg)",
              color: "var(--admin-text)",
              border: "1px solid var(--admin-card-border)",
            }}>
            Chiudi
          </button>
          {!alreadyDecided ? (
            <>
              <button
                type="button"
                onClick={() => submit("dismissed")}
                disabled={isSubmitting}
                className="px-4 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50 flex items-center gap-2"
                style={{
                  background: "var(--admin-hover-bg)",
                  color: "var(--admin-text)",
                  border: "1px solid var(--admin-card-border)",
                }}>
                {isSubmitting ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <CheckCircle2 size={13} />
                )}
                Respingi segnalazione
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!postAlreadyDeleted) {
                    if (
                      !confirm(
                        "Confermi il soft-delete del post? L'autore potrà appellarsi entro 7 giorni.",
                      )
                    )
                      return;
                  }
                  submit("actioned");
                }}
                disabled={isSubmitting}
                className="px-4 py-1.5 rounded-lg text-sm font-medium text-white disabled:opacity-50 flex items-center gap-2"
                style={{ background: "var(--gc-neg, #dc2626)" }}>
                {isSubmitting ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <AlertOctagon size={13} />
                )}
                {postAlreadyDeleted ? "Conferma action" : "Soft-delete post"}
              </button>
            </>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
