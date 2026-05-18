"use client";
// app/(admin)/admin/modules/posts/reports/_components/report-history.tsx
//
// Sezione "Storico segnalazioni" condivisa tra il dialog di review per i
// post e quello per i commenti. Mostra ogni singola riga di posts_reports
// del target con: reporter, reason, status, e details (che include le
// note del moderatore appese dalle review precedenti via COALESCE ||
// noteSuffix in reviewReportAction). È qui che le note "spariscono dopo
// l'azione" tornano visibili.
//
// rows = null → still loading (skeleton compatto)
// rows = []   → niente (la sezione non si renderizza)
// rows = [...] → lista
import type { ReportDetailRow } from "../actions";

const STATUS_PILL: Record<
  string,
  { label: string; bg: string; fg: string }
> = {
  open: { label: "Aperto", bg: "#f59e0b22", fg: "#b45309" },
  reviewed: {
    label: "Esaminato",
    bg: "var(--admin-hover-bg)",
    fg: "var(--admin-text-muted)",
  },
  dismissed: {
    label: "Respinto",
    bg: "var(--admin-hover-bg)",
    fg: "var(--admin-text-faint)",
  },
  actioned: { label: "Accettato", bg: "#dc262622", fg: "#dc2626" },
};

function timeShort(d: Date | string): string {
  const dd = typeof d === "string" ? new Date(d) : d;
  return dd.toLocaleString("it-IT", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ReportHistory({
  rows,
  error,
  reasonLabels,
}: {
  rows: ReportDetailRow[] | null;
  error: string | null;
  reasonLabels: Record<string, string>;
}) {
  if (error) {
    return (
      <div
        className="rounded-lg p-3 text-xs"
        style={{
          background: "var(--admin-card-bg)",
          border: "1px solid var(--admin-card-border)",
          color: "var(--gc-neg, #dc2626)",
        }}>
        Errore caricamento storico: {error}
      </div>
    );
  }

  if (rows === null) {
    return (
      <div
        className="rounded-lg p-3"
        style={{
          background: "var(--admin-card-bg)",
          border: "1px solid var(--admin-card-border)",
        }}>
        <p
          className="text-[11px] uppercase tracking-wider mb-2"
          style={{ color: "var(--admin-text-faint)" }}>
          Storico segnalazioni
        </p>
        <p
          className="text-xs italic"
          style={{ color: "var(--admin-text-faint)" }}>
          Carico…
        </p>
      </div>
    );
  }

  if (rows.length === 0) return null;

  return (
    <div
      className="rounded-lg p-3"
      style={{
        background: "var(--admin-card-bg)",
        border: "1px solid var(--admin-card-border)",
      }}>
      <p
        className="text-[11px] uppercase tracking-wider mb-2"
        style={{ color: "var(--admin-text-faint)" }}>
        Storico segnalazioni ({rows.length})
      </p>
      <ul className="space-y-2 max-h-72 overflow-y-auto pr-1">
        {rows.map((r) => {
          const pill = STATUS_PILL[r.status] ?? STATUS_PILL.open;
          const reasonLabel = reasonLabels[r.reason] ?? r.reason;
          return (
            <li
              key={r.id}
              className="rounded-md p-2.5"
              style={{
                background: "var(--admin-page-bg)",
                border: "1px solid var(--admin-card-border)",
              }}>
              <div className="flex flex-wrap items-baseline gap-2">
                <span
                  className="text-xs font-medium"
                  style={{ color: "var(--admin-text)" }}>
                  @{r.reporter.username ?? r.reporter.id.slice(0, 8)}
                </span>
                <span
                  className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-semibold"
                  style={{
                    background:
                      "color-mix(in srgb, var(--admin-accent) 14%, transparent)",
                    color: "var(--admin-accent)",
                  }}>
                  {reasonLabel}
                </span>
                <span
                  className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-semibold"
                  style={{ background: pill.bg, color: pill.fg }}>
                  {pill.label}
                </span>
                <span
                  className="text-[11px] ml-auto"
                  style={{ color: "var(--admin-text-faint)" }}>
                  {timeShort(r.createdAt)}
                </span>
              </div>
              {r.details ? (
                <p
                  className="text-xs whitespace-pre-wrap mt-1.5"
                  style={{ color: "var(--admin-text-muted)" }}>
                  {r.details}
                </p>
              ) : null}
              {r.reviewedAt && r.reviewedAt !== r.createdAt ? (
                <p
                  className="text-[10px] italic mt-1"
                  style={{ color: "var(--admin-text-faint)" }}>
                  Esaminato il {timeShort(r.reviewedAt)}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
