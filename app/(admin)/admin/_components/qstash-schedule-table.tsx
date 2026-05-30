"use client";
// app/(admin)/admin/_components/qstash-schedule-table.tsx
//
// Tabella degli schedule QStash per le pagine cron admin (settings + moduli).
// Puramente presentational: riceve i dati dal server component parent.
// Colonne: Job · Cadenza · URL endpoint · Stato QStash.
// Non ha toggle (QStash manage via console Upstash) né fetchRuns pg_cron.

import {
  CheckCircle2,
  CircleSlash,
  Clock,
  Info,
  ChevronDown,
  ChevronRight,
  PauseCircle,
} from "lucide-react";
import { useState } from "react";

export interface QStashRow {
  jobname: string;
  label: string;
  description: string;
  purpose: string;
  schedule: string;   // cron expr da CRON_SCHEDULES
  path: string;
  /** Dati live da QStash API. Null = schedule non trovato su QStash (non creato). */
  qstash: {
    isPaused: boolean;
    createdAt: number;
    /** La cron su QStash — può differire da `schedule` se si è aggiornata la config senza risync. */
    liveCron: string;
  } | null;
}

export function QStashScheduleTable({
  rows,
  emptyMessage,
}: {
  rows: QStashRow[];
  emptyMessage?: string;
}) {
  if (rows.length === 0) {
    return (
      <div
        className="rounded-xl shadow-sm p-8 text-center text-sm"
        style={{
          background: "var(--admin-card-bg)",
          border: "1px solid var(--admin-card-border)",
          color: "var(--admin-text-faint)",
        }}>
        {emptyMessage ?? "No schedules."}
      </div>
    );
  }

  return (
    <div
      className="rounded-xl shadow-sm overflow-hidden"
      style={{
        background: "var(--admin-card-bg)",
        border: "1px solid var(--admin-card-border)",
      }}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr
              style={{
                color: "var(--admin-text-faint)",
                borderBottom: "1px solid var(--admin-input-border)",
              }}>
              <th className="text-left font-medium py-3 px-4 w-10" />
              <th className="text-left font-medium py-3 px-4">Job</th>
              <th className="text-left font-medium py-3 px-4">Schedule</th>
              <th className="text-left font-medium py-3 px-4">Endpoint</th>
              <th className="text-left font-medium py-3 px-4">QStash</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <QStashRowItem key={row.jobname} row={row} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function QStashRowItem({ row }: { row: QStashRow }) {
  const [expanded, setExpanded] = useState(false);

  const cronMismatch =
    row.qstash !== null && row.qstash.liveCron !== row.schedule;

  return (
    <>
      <tr
        style={{ borderTop: "1px solid var(--admin-input-border)" }}
        className="align-top">
        <td className="py-3 px-4">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="p-1 rounded hover:bg-black/5 transition-colors"
            style={{ color: "var(--admin-text-muted)" }}
            aria-label={expanded ? "Collapse" : "Expand"}>
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
        </td>

        <td className="py-3 px-4">
          <div className="flex flex-col gap-0.5">
            <span className="font-semibold" style={{ color: "var(--admin-text)" }}>
              {row.label}
            </span>
            <span className="font-mono text-xs" style={{ color: "var(--admin-text-faint)" }}>
              {row.jobname}
            </span>
            <p className="text-xs mt-0.5 leading-snug" style={{ color: "var(--admin-text-muted)" }}>
              {row.description}
            </p>
          </div>
        </td>

        <td className="py-3 px-4">
          <div className="flex flex-col gap-0.5">
            <span className="font-mono text-xs" style={{ color: "var(--admin-text-muted)" }}>
              {row.schedule}
            </span>
            {cronMismatch && row.qstash && (
              <span
                className="font-mono text-[11px] px-1.5 py-0.5 rounded w-fit"
                style={{
                  background: "color-mix(in srgb, #d97706 12%, transparent)",
                  color: "#d97706",
                  border: "1px solid color-mix(in srgb, #d97706 30%, transparent)",
                }}
                title="QStash live schedule differs from config — re-run pnpm cron:sync">
                live: {row.qstash.liveCron}
              </span>
            )}
          </div>
        </td>

        <td className="py-3 px-4">
          <span
            className="font-mono text-xs break-all"
            style={{ color: "var(--admin-text-faint)" }}>
            {row.path}
          </span>
        </td>

        <td className="py-3 px-4">
          <QStashStatusBadge qstash={row.qstash} />
        </td>
      </tr>

      {expanded && (
        <tr style={{ background: "var(--admin-page-bg)" }}>
          <td colSpan={5} className="py-4 px-4">
            <div className="space-y-2 max-w-2xl">
              <h4
                className="text-xs font-semibold uppercase tracking-wide flex items-center gap-1.5"
                style={{ color: "var(--admin-text-faint)" }}>
                <Info size={12} /> Purpose
              </h4>
              <p className="text-sm leading-relaxed" style={{ color: "var(--admin-text)" }}>
                {row.purpose}
              </p>
              {row.qstash && (
                <p className="text-xs" style={{ color: "var(--admin-text-faint)" }}>
                  Created on QStash:{" "}
                  {row.qstash.createdAt
                    ? new Date(row.qstash.createdAt).toLocaleString()
                    : "—"}
                </p>
              )}
              {cronMismatch && (
                <p
                  className="text-xs px-2 py-1 rounded"
                  style={{
                    background: "color-mix(in srgb, #d97706 8%, transparent)",
                    color: "#d97706",
                    border: "1px solid color-mix(in srgb, #d97706 25%, transparent)",
                  }}>
                  Schedule mismatch: config says <code>{row.schedule}</code>, QStash
                  has <code>{row.qstash?.liveCron}</code>. Run{" "}
                  <code>pnpm cron:sync</code> to reconcile.
                </p>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function QStashStatusBadge({
  qstash,
}: {
  qstash: QStashRow["qstash"];
}) {
  if (!qstash) {
    return (
      <span
        className="inline-flex items-center gap-1 text-xs"
        style={{ color: "var(--admin-text-faint)" }}>
        <CircleSlash size={11} /> Not on QStash
      </span>
    );
  }
  if (qstash.isPaused) {
    return (
      <span
        className="inline-flex items-center gap-1 text-xs"
        style={{ color: "#d97706" }}>
        <PauseCircle size={11} /> Paused
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 text-xs"
      style={{ color: "var(--gc-pos, #16a34a)" }}>
      <CheckCircle2 size={11} /> Active
    </span>
  );
}

// Usato dalla pagina core per i 2 job SQL rimasti su pg_cron.
export function PgCronSqlJobBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 text-xs"
      style={{ color: "var(--admin-text-muted)" }}>
      <Clock size={11} /> Direct SQL
    </span>
  );
}
