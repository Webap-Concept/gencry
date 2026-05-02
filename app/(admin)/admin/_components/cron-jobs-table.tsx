"use client";

/**
 * CronJobsTable — tabella riusabile per /admin/settings/cron e
 * /admin/modules/<slug>/cron.
 *
 * Le righe vengono renderizzate da una lista già filtrata dal server
 * (core, modulo, untracked). Espone:
 *  - toggle attivo/disattivo (server action)
 *  - drawer "Logs" che ricarica i runs on-demand
 *
 * Tutte le label sono in inglese (admin UI).
 */
import { AdminToast } from "@/app/(admin)/admin/_components/toast";
import type { PgCronJobWithLastRun, PgCronRun } from "@/lib/cron/queries";
import type { CronJobMeta } from "@/lib/cron/registry";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleSlash,
  Clock,
  Info,
  Loader2,
  Power,
  XCircle,
} from "lucide-react";
import { useState, useTransition } from "react";

export type CronRow = {
  job: PgCronJobWithLastRun;
  meta: CronJobMeta | null;
};

export type CronToggleResult =
  | { success: string; timestamp: number }
  | { error: string; timestamp: number };

interface Props {
  rows: CronRow[];
  /** Server action invocata dal toggle attivo/disattivo. */
  toggleAction: (jobid: number, active: boolean) => Promise<CronToggleResult>;
  /** Server action che ritorna gli ultimi N run di un job. */
  fetchRunsAction: (jobid: number) => Promise<PgCronRun[]>;
  /** Testo da mostrare quando la lista è vuota. */
  emptyMessage?: string;
}

export function CronJobsTable({ rows, toggleAction, fetchRunsAction, emptyMessage }: Props) {
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  if (rows.length === 0) {
    return (
      <div
        className="rounded-xl shadow-sm p-8 text-center text-sm"
        style={{
          background: "var(--admin-card-bg)",
          border: "1px solid var(--admin-card-border)",
          color: "var(--admin-text-faint)",
        }}>
        {emptyMessage ?? "No cron jobs registered."}
      </div>
    );
  }

  return (
    <>
      <div
        className="rounded-xl shadow-sm overflow-hidden"
        style={{
          background: "var(--admin-card-bg)",
          border: "1px solid var(--admin-card-border)",
        }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ color: "var(--admin-text-faint)", borderBottom: "1px solid var(--admin-input-border)" }}>
                <th className="text-left font-medium py-3 px-4 w-10"></th>
                <th className="text-left font-medium py-3 px-4">Job</th>
                <th className="text-left font-medium py-3 px-4">Schedule</th>
                <th className="text-left font-medium py-3 px-4">Last run</th>
                <th className="text-left font-medium py-3 px-4">Status</th>
                <th className="text-right font-medium py-3 px-4">Active</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <CronRowItem
                  key={row.job.jobid}
                  row={row}
                  toggleAction={toggleAction}
                  fetchRunsAction={fetchRunsAction}
                  onToast={setToast}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {toast && <AdminToast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
    </>
  );
}

function CronRowItem({
  row,
  toggleAction,
  fetchRunsAction,
  onToast,
}: {
  row: CronRow;
  toggleAction: (jobid: number, active: boolean) => Promise<CronToggleResult>;
  fetchRunsAction: (jobid: number) => Promise<PgCronRun[]>;
  onToast: (t: { message: string; type: "success" | "error" }) => void;
}) {
  const { job, meta } = row;
  const [expanded, setExpanded] = useState(false);
  const [active, setActive] = useState(job.active);
  const [pending, startTransition] = useTransition();
  const [runs, setRuns] = useState<PgCronRun[] | null>(null);
  const [loadingRuns, setLoadingRuns] = useState(false);

  function handleToggle() {
    const next = !active;
    startTransition(async () => {
      const result = await toggleAction(job.jobid, next);
      if ("success" in result) {
        setActive(next);
        onToast({ message: result.success, type: "success" });
      } else {
        onToast({ message: result.error, type: "error" });
      }
    });
  }

  async function handleExpand() {
    const next = !expanded;
    setExpanded(next);
    if (next && runs === null) {
      setLoadingRuns(true);
      try {
        const data = await fetchRunsAction(job.jobid);
        setRuns(data);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to load runs";
        onToast({ message: msg, type: "error" });
        setRuns([]);
      } finally {
        setLoadingRuns(false);
      }
    }
  }

  const lastRun = job.lastRun;
  const displayName = meta?.label ?? job.jobname ?? `job-${job.jobid}`;

  return (
    <>
      <tr
        style={{ borderTop: "1px solid var(--admin-input-border)" }}
        className="align-top">
        <td className="py-3 px-4">
          <button
            type="button"
            onClick={handleExpand}
            className="p-1 rounded hover:bg-black/5 transition-colors"
            style={{ color: "var(--admin-text-muted)" }}
            aria-label={expanded ? "Collapse" : "Expand"}>
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
        </td>
        <td className="py-3 px-4">
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <span className="font-semibold" style={{ color: "var(--admin-text)" }}>
                {displayName}
              </span>
              {!meta && (
                <span
                  className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded"
                  style={{
                    background: "color-mix(in srgb, var(--admin-text-faint) 12%, transparent)",
                    color: "var(--admin-text-faint)",
                  }}
                  title="This job is in pg_cron but not in the application registry. Add it to lib/cron/registry.ts or to a module manifest.">
                  Untracked
                </span>
              )}
            </div>
            {job.jobname && meta && (
              <span className="font-mono text-xs" style={{ color: "var(--admin-text-faint)" }}>
                {job.jobname}
              </span>
            )}
            {meta && (
              <p className="text-xs mt-1 leading-snug" style={{ color: "var(--admin-text-muted)" }}>
                {meta.description}
              </p>
            )}
          </div>
        </td>
        <td className="py-3 px-4">
          <span className="font-mono text-xs" style={{ color: "var(--admin-text-muted)" }}>
            {job.schedule}
          </span>
        </td>
        <td className="py-3 px-4">
          <span className="font-mono text-xs" style={{ color: "var(--admin-text-muted)" }}>
            {lastRun?.startTime ? lastRun.startTime.toLocaleString() : "—"}
          </span>
        </td>
        <td className="py-3 px-4">
          <RunStatusBadge run={lastRun} jobActive={active} />
        </td>
        <td className="py-3 px-4 text-right">
          <button
            type="button"
            onClick={handleToggle}
            disabled={pending}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors disabled:opacity-60"
            style={{
              background: active
                ? "color-mix(in srgb, var(--gc-pos, #16a34a) 14%, transparent)"
                : "color-mix(in srgb, var(--admin-text-faint) 14%, transparent)",
              color: active ? "var(--gc-pos, #16a34a)" : "var(--admin-text-faint)",
              border: `1px solid ${
                active
                  ? "color-mix(in srgb, var(--gc-pos, #16a34a) 30%, transparent)"
                  : "color-mix(in srgb, var(--admin-text-faint) 24%, transparent)"
              }`,
            }}
            title={active ? "Click to disable" : "Click to enable"}>
            {pending ? <Loader2 size={11} className="animate-spin" /> : <Power size={11} />}
            {active ? "Active" : "Disabled"}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr style={{ background: "var(--admin-page-bg)" }}>
          <td colSpan={6} className="py-4 px-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide flex items-center gap-1.5" style={{ color: "var(--admin-text-faint)" }}>
                  <Info size={12} /> Purpose
                </h4>
                {meta ? (
                  <p className="text-sm leading-relaxed" style={{ color: "var(--admin-text)" }}>
                    {meta.purpose}
                  </p>
                ) : (
                  <p className="text-xs italic" style={{ color: "var(--admin-text-faint)" }}>
                    No metadata. Register this job in lib/cron/registry.ts (core)
                    or in the matching module manifest to add a description.
                  </p>
                )}
                <h4 className="text-xs font-semibold uppercase tracking-wide pt-2" style={{ color: "var(--admin-text-faint)" }}>
                  Command
                </h4>
                <pre
                  className="text-[11px] font-mono p-2 rounded overflow-x-auto whitespace-pre-wrap break-all"
                  style={{
                    background: "var(--admin-card-bg)",
                    border: "1px solid var(--admin-input-border)",
                    color: "var(--admin-text-muted)",
                  }}>
                  {job.command}
                </pre>
              </div>
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide flex items-center gap-1.5 mb-2" style={{ color: "var(--admin-text-faint)" }}>
                  <Clock size={12} /> Recent runs
                </h4>
                {loadingRuns ? (
                  <div className="flex items-center gap-2 text-xs" style={{ color: "var(--admin-text-faint)" }}>
                    <Loader2 size={12} className="animate-spin" /> Loading…
                  </div>
                ) : runs && runs.length > 0 ? (
                  <RunsList runs={runs} />
                ) : (
                  <p className="text-xs italic" style={{ color: "var(--admin-text-faint)" }}>
                    No runs recorded yet.
                  </p>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function RunStatusBadge({ run, jobActive }: { run: PgCronRun | null; jobActive: boolean }) {
  if (!run) {
    return (
      <span className="inline-flex items-center gap-1 text-xs" style={{ color: "var(--admin-text-faint)" }}>
        <CircleSlash size={11} /> No runs
      </span>
    );
  }
  const status = run.status.toLowerCase();
  if (status === "succeeded") {
    return (
      <span className="inline-flex items-center gap-1 text-xs" style={{ color: "var(--gc-pos, #16a34a)" }}>
        <CheckCircle2 size={11} /> Succeeded
        {run.durationMs != null && <span className="font-mono text-[10px]" style={{ color: "var(--admin-text-faint)" }}>· {run.durationMs}ms</span>}
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-1 text-xs" style={{ color: "var(--gc-neg, #dc2626)" }} title={run.returnMessage ?? undefined}>
        <XCircle size={11} /> Failed
      </span>
    );
  }
  if (status === "running" || status === "starting") {
    return (
      <span className="inline-flex items-center gap-1 text-xs" style={{ color: "var(--admin-accent)" }}>
        <Loader2 size={11} className="animate-spin" /> {run.status}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs" style={{ color: jobActive ? "var(--admin-text-muted)" : "var(--admin-text-faint)" }}>
      <Clock size={11} /> {run.status}
    </span>
  );
}

function RunsList({ runs }: { runs: PgCronRun[] }) {
  return (
    <div className="space-y-1.5 max-h-72 overflow-y-auto">
      {runs.map((r) => {
        const failed = r.status.toLowerCase() === "failed";
        return (
          <div
            key={r.runid}
            className="flex items-start gap-2 text-xs p-2 rounded"
            style={{
              background: "var(--admin-card-bg)",
              border: "1px solid var(--admin-input-border)",
            }}>
            <div className="flex-shrink-0 mt-0.5">
              {failed ? (
                <XCircle size={12} style={{ color: "var(--gc-neg, #dc2626)" }} />
              ) : r.status.toLowerCase() === "succeeded" ? (
                <CheckCircle2 size={12} style={{ color: "var(--gc-pos, #16a34a)" }} />
              ) : (
                <Clock size={12} style={{ color: "var(--admin-text-muted)" }} />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex justify-between gap-2">
                <span className="font-mono" style={{ color: "var(--admin-text-muted)" }}>
                  {r.startTime ? r.startTime.toLocaleString() : "—"}
                </span>
                <span className="font-mono" style={{ color: "var(--admin-text-faint)" }}>
                  {r.durationMs != null ? `${r.durationMs}ms` : "—"}
                </span>
              </div>
              {r.returnMessage && failed && (
                <p
                  className="font-mono text-[11px] mt-1 break-all"
                  style={{ color: "var(--gc-neg, #dc2626)" }}>
                  {r.returnMessage}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
