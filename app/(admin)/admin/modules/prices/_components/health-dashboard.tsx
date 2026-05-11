"use client";

import { AdminToast } from "@/app/(admin)/admin/_components/toast";
import type { BreakerState } from "@/lib/modules/prices/circuit-breaker";
import type { PricesConfig } from "@/lib/modules/prices/config";
import type { RecentRunStats } from "@/lib/modules/prices/queries";
import type { PricesSyncRun } from "@/lib/db/schema";
import { CheckCircle2, Loader2, PlayCircle, ShieldAlert, ShieldCheck, XCircle } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  triggerCleanupNowAction,
  triggerSnapshotNowAction,
  triggerSyncNowAction,
  type ActionState,
} from "../actions";

interface Props {
  config: PricesConfig;
  breakers: BreakerState[];
  syncStats: RecentRunStats;
  snapshotStats: RecentRunStats;
  cleanupStats: RecentRunStats;
  recentRuns: PricesSyncRun[];
}

export function HealthDashboard({
  config,
  breakers,
  syncStats,
  snapshotStats,
  cleanupStats,
  recentRuns,
}: Props) {
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [busyKind, setBusyKind] = useState<"sync" | "snapshot" | "cleanup" | null>(null);

  function handleResult(state: ActionState) {
    if ("success" in state && state.success) {
      setToast({ message: state.success, type: "success" });
    } else if ("error" in state && state.error) {
      setToast({ message: state.error, type: "error" });
    }
  }

  function trigger(kind: "sync" | "snapshot" | "cleanup") {
    setBusyKind(kind);
    startTransition(async () => {
      const fn =
        kind === "sync" ? triggerSyncNowAction
        : kind === "snapshot" ? triggerSnapshotNowAction
        : triggerCleanupNowAction;
      const result = await fn();
      handleResult(result);
      setBusyKind(null);
    });
  }

  return (
    <>
      <div className="space-y-5">
        {/* Source health (circuit breakers) */}
        <Card title="Source health">
          <div className="grid gap-3 md:grid-cols-2">
            {breakers.map((b) => (
              <SourceCard key={b.source} breaker={b} />
            ))}
          </div>
        </Card>

        {/* Recent stats per kind */}
        <Card title="Recent runs (rolling)">
          <div className="grid gap-3 md:grid-cols-3">
            <StatCard
              label="Sync (24h)"
              stats={syncStats}
              expectedMinutes={config.cronMinutes}
              onTrigger={() => trigger("sync")}
              busy={isPending && busyKind === "sync"}
              actionLabel="Run now"
            />
            <StatCard
              label="Snapshot (24h)"
              stats={snapshotStats}
              expectedMinutes={config.snapshotMinutes}
              onTrigger={() => trigger("snapshot")}
              busy={isPending && busyKind === "snapshot"}
              actionLabel="Snapshot now"
            />
            <StatCard
              label="Cleanup (7d)"
              stats={cleanupStats}
              expectedMinutes={null}
              onTrigger={() => trigger("cleanup")}
              busy={isPending && busyKind === "cleanup"}
              actionLabel="Cleanup now"
            />
          </div>
        </Card>

        {/* Last 20 runs */}
        <Card title="Recent runs (raw log)">
          <div className="overflow-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ color: "var(--admin-text-faint)" }}>
                  <th className="text-left font-medium py-2 px-2">When</th>
                  <th className="text-left font-medium py-2 px-2">Kind</th>
                  <th className="text-left font-medium py-2 px-2">Source</th>
                  <th className="text-right font-medium py-2 px-2">Updated / Total</th>
                  <th className="text-right font-medium py-2 px-2">Duration</th>
                  <th className="text-left font-medium py-2 px-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentRuns.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center" style={{ color: "var(--admin-text-faint)" }}>
                      No runs yet.
                    </td>
                  </tr>
                )}
                {recentRuns.map((r) => (
                  <tr
                    key={r.id}
                    style={{ borderTop: "1px solid var(--admin-input-border)" }}>
                    <td className="py-2 px-2 font-mono" style={{ color: "var(--admin-text-muted)" }}>
                      {r.startedAt.toLocaleString()}
                    </td>
                    <td className="py-2 px-2" style={{ color: "var(--admin-text)" }}>{r.kind}</td>
                    <td className="py-2 px-2" style={{ color: "var(--admin-text-muted)" }}>{r.sourceUsed ?? "—"}</td>
                    <td className="py-2 px-2 text-right font-mono" style={{ color: "var(--admin-text)" }}>
                      {r.coinsUpdated} / {r.coinsTotal}
                    </td>
                    <td className="py-2 px-2 text-right font-mono" style={{ color: "var(--admin-text-muted)" }}>
                      {r.durationMs ?? 0}ms
                    </td>
                    <td className="py-2 px-2">
                      {r.ok ? (
                        <span className="inline-flex items-center gap-1" style={{ color: "var(--gc-pos, #16a34a)" }}>
                          <CheckCircle2 size={12} /> OK
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1" style={{ color: "var(--gc-neg, #dc2626)" }} title={r.error ?? ""}>
                          <XCircle size={12} /> Error
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {toast && <AdminToast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-xl shadow-sm p-6"
      style={{
        background: "var(--admin-card-bg)",
        border: "1px solid var(--admin-card-border)",
      }}>
      <h3 className="text-sm font-semibold mb-4" style={{ color: "var(--admin-text)" }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

function SourceCard({ breaker }: { breaker: BreakerState }) {
  const isOk = breaker.status === "closed";
  const isHalfOpen = breaker.status === "half-open";
  const Icon = isOk ? ShieldCheck : ShieldAlert;
  const color = isOk ? "var(--gc-pos, #16a34a)" : isHalfOpen ? "#d97706" : "var(--gc-neg, #dc2626)";

  return (
    <div
      className="p-4 rounded-lg"
      style={{
        background: "var(--admin-page-bg)",
        border: "1px solid var(--admin-input-border)",
      }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon size={16} style={{ color }} />
          <span className="text-sm font-semibold capitalize" style={{ color: "var(--admin-text)" }}>
            {breaker.source}
          </span>
          <span
            className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded"
            style={{
              background: `color-mix(in srgb, ${color} 12%, transparent)`,
              color,
            }}>
            {breaker.status}
          </span>
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        <dt style={{ color: "var(--admin-text-faint)" }}>Successes</dt>
        <dd className="text-right font-mono" style={{ color: "var(--admin-text)" }}>{breaker.successCount}</dd>
        <dt style={{ color: "var(--admin-text-faint)" }}>Errors</dt>
        <dd className="text-right font-mono" style={{ color: "var(--admin-text)" }}>{breaker.errorCount}</dd>
        <dt style={{ color: "var(--admin-text-faint)" }}>Avg latency</dt>
        <dd className="text-right font-mono" style={{ color: "var(--admin-text)" }}>
          {breaker.avgLatencyMs !== null ? `${breaker.avgLatencyMs}ms` : "—"}
        </dd>
        <dt style={{ color: "var(--admin-text-faint)" }}>Last success</dt>
        <dd className="text-right font-mono" style={{ color: "var(--admin-text-muted)" }}>
          {breaker.lastSuccessAt ? breaker.lastSuccessAt.toLocaleString() : "—"}
        </dd>
        <dt style={{ color: "var(--admin-text-faint)" }}>Last error</dt>
        <dd className="text-right font-mono" style={{ color: "var(--admin-text-muted)" }}>
          {breaker.lastErrorAt ? breaker.lastErrorAt.toLocaleString() : "—"}
        </dd>
      </dl>
      {breaker.lastError && (
        <p className="mt-2 text-[11px] font-mono break-all" style={{ color: "var(--gc-neg, #dc2626)" }}>
          {breaker.lastError}
        </p>
      )}
      {breaker.openUntil && breaker.status === "open" && (
        <p className="mt-2 text-[11px]" style={{ color: "var(--admin-text-faint)" }}>
          Open until <span className="font-mono">{breaker.openUntil.toLocaleString()}</span>
        </p>
      )}
    </div>
  );
}

function StatCard({
  label,
  stats,
  expectedMinutes,
  onTrigger,
  busy,
  actionLabel,
}: {
  label: string;
  stats: RecentRunStats;
  expectedMinutes: number | null;
  onTrigger: () => void;
  busy: boolean;
  actionLabel: string;
}) {
  const successRate = stats.total > 0 ? Math.round((stats.ok / stats.total) * 100) : null;
  return (
    <div
      className="p-4 rounded-lg space-y-2"
      style={{
        background: "var(--admin-page-bg)",
        border: "1px solid var(--admin-input-border)",
      }}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold" style={{ color: "var(--admin-text)" }}>{label}</p>
        <button
          type="button"
          onClick={onTrigger}
          disabled={busy}
          className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md transition-colors disabled:opacity-60"
          style={{
            background: "var(--admin-accent)",
            color: "#fff",
          }}>
          {busy ? <Loader2 size={11} className="animate-spin" /> : <PlayCircle size={11} />}
          {actionLabel}
        </button>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <dt style={{ color: "var(--admin-text-faint)" }}>Runs</dt>
        <dd className="text-right font-mono" style={{ color: "var(--admin-text)" }}>{stats.total}</dd>
        <dt style={{ color: "var(--admin-text-faint)" }}>Success rate</dt>
        <dd className="text-right font-mono" style={{ color: "var(--admin-text)" }}>
          {successRate !== null ? `${successRate}%` : "—"}
        </dd>
        <dt style={{ color: "var(--admin-text-faint)" }}>Avg duration</dt>
        <dd className="text-right font-mono" style={{ color: "var(--admin-text-muted)" }}>
          {stats.avgDurationMs !== null ? `${stats.avgDurationMs}ms` : "—"}
        </dd>
        <dt style={{ color: "var(--admin-text-faint)" }}>Last run</dt>
        <dd className="text-right font-mono" style={{ color: "var(--admin-text-muted)" }}>
          {stats.lastRunAt ? stats.lastRunAt.toLocaleString() : "—"}
        </dd>
        {expectedMinutes !== null && (
          <>
            <dt style={{ color: "var(--admin-text-faint)" }}>Configured every</dt>
            <dd className="text-right font-mono" style={{ color: "var(--admin-text-muted)" }}>{expectedMinutes}m</dd>
          </>
        )}
      </dl>
    </div>
  );
}

