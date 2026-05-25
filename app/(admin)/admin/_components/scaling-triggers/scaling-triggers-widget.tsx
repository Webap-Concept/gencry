// app/(admin)/admin/_components/scaling-triggers/scaling-triggers-widget.tsx
//
// Widget admin che renderizza tutti gli ScalingTrigger raccolti da
// `collectAllScalingTriggers()` con stato semaforo (verde/giallo/rosso),
// valore corrente vs threshold, softMitigation (quando applicabile),
// link "cosa fare". Suspense per-trigger così uno slow non blocca gli
// altri. Errore di probe non rompe il widget — la tile mostra "n/d".
//
// Stato:
//   - lower-is-worse  : value < threshold → critical | value < warn → warn | else ok
//   - higher-is-worse : value > threshold → critical | value > warn → warn | else ok
//   - manualCheck     : sempre "info" (giallo soft), invita l'utente a
//                       controllare manualmente
//   - n/d (probe error o no_data_yet) : info neutro grigio
import "server-only";
import { Suspense } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, ExternalLink, Eye, HelpCircle, ShieldAlert } from "lucide-react";
import {
  collectAllScalingTriggers,
  type ScalingTriggerWithSource,
} from "@/lib/admin/scaling-triggers/collect";

type Status = "ok" | "warn" | "critical" | "info" | "unknown";

const STATUS_STYLE: Record<Status, { bg: string; fg: string; bar: string; label: string }> = {
  ok:       { bg: "color-mix(in srgb, #16a34a 12%, var(--admin-card-bg))", fg: "#16a34a", bar: "#16a34a", label: "OK" },
  warn:     { bg: "color-mix(in srgb, #d97706 14%, var(--admin-card-bg))", fg: "#b45309", bar: "#d97706", label: "Watch" },
  critical: { bg: "color-mix(in srgb, #dc2626 14%, var(--admin-card-bg))", fg: "#b91c1c", bar: "#dc2626", label: "Action" },
  info:     { bg: "color-mix(in srgb, #0891b2 12%, var(--admin-card-bg))", fg: "#0e7490", bar: "#0891b2", label: "Manual" },
  unknown:  { bg: "color-mix(in srgb, #6b7280 12%, var(--admin-card-bg))", fg: "#4b5563", bar: "#6b7280", label: "n/d" },
};

const STATUS_ICON: Record<Status, typeof CheckCircle2> = {
  ok: CheckCircle2,
  warn: AlertTriangle,
  critical: ShieldAlert,
  info: Eye,
  unknown: HelpCircle,
};

export async function ScalingTriggersWidget() {
  const triggers = collectAllScalingTriggers();
  if (triggers.length === 0) return null;
  return (
    <section className="space-y-3">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold" style={{ color: "var(--admin-fg)" }}>
            Scaling triggers
          </h2>
          <p className="text-xs" style={{ color: "var(--admin-fg-muted)" }}>
            Misure live confrontate con le soglie di intervento dichiarate dai moduli. Quando una tile diventa gialla o rossa → leggi l'azione consigliata.
          </p>
        </div>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {triggers.map((trigger) => (
          <Suspense key={trigger.id} fallback={<TriggerTileSkeleton trigger={trigger} />}>
            <TriggerTile trigger={trigger} />
          </Suspense>
        ))}
      </div>
    </section>
  );
}

function TriggerTileSkeleton({ trigger }: { trigger: ScalingTriggerWithSource }) {
  return (
    <div
      className="rounded-lg p-3 border animate-pulse"
      style={{
        background: STATUS_STYLE.unknown.bg,
        borderColor: "var(--admin-border)",
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium" style={{ color: "var(--admin-fg)" }}>
          {trigger.label}
        </div>
        <SourceBadge source={trigger.source} />
      </div>
      <div className="h-5 w-24 rounded mb-2" style={{ background: "var(--admin-border)" }} />
      <div className="h-2 rounded-full" style={{ background: "var(--admin-border)" }} />
    </div>
  );
}

async function TriggerTile({ trigger }: { trigger: ScalingTriggerWithSource }) {
  // Probe call. Tutte safe-to-fail.
  let measure: {
    value: number | null;
    unit: string;
    formatted?: string;
    error?: string;
  } | null = null;

  if (!trigger.manualCheck && trigger.loadMeasure) {
    try {
      const mod = await trigger.loadMeasure();
      measure = await mod.default();
    } catch (err) {
      measure = { value: null, unit: trigger.displayUnit ?? "", error: String(err) };
    }
  }

  const status = computeStatus(trigger, measure);
  const style = STATUS_STYLE[status];
  const Icon = STATUS_ICON[status];
  const pct = computePercent(trigger, measure?.value ?? null);

  const displayValue = trigger.manualCheck
    ? "Manual check"
    : measure?.value === null || measure?.value === undefined
      ? "n/d"
      : (measure.formatted ?? `${formatNumber(measure.value)} ${trigger.displayUnit ?? measure.unit}`);

  return (
    <div
      className="rounded-lg p-3 border"
      style={{
        background: style.bg,
        borderColor: "var(--admin-border)",
      }}
    >
      <div className="flex items-center justify-between mb-1.5 gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Icon size={14} style={{ color: style.fg, flexShrink: 0 }} />
          <div
            className="text-sm font-medium truncate"
            style={{ color: "var(--admin-fg)" }}
            title={trigger.description}
          >
            {trigger.label}
          </div>
        </div>
        <SourceBadge source={trigger.source} />
      </div>

      <div className="flex items-baseline justify-between mb-2 gap-2">
        <div className="text-base font-semibold tabular-nums" style={{ color: style.fg }}>
          {displayValue}
        </div>
        <div className="text-[10px]" style={{ color: "var(--admin-fg-muted)" }}>
          {trigger.direction === "lower-is-worse" ? "Min: " : "Max: "}
          {formatNumber(trigger.threshold)} {trigger.displayUnit ?? ""}
        </div>
      </div>

      {/* Progress bar (skip se manual o n/d) */}
      {pct !== null && (
        <div
          className="h-1.5 rounded-full overflow-hidden"
          style={{ background: "color-mix(in srgb, var(--admin-fg-muted) 20%, transparent)" }}
        >
          <div
            className="h-full transition-all"
            style={{ width: `${Math.min(100, pct)}%`, background: style.bar }}
          />
        </div>
      )}

      {/* Manual / error annotation */}
      {trigger.manualCheck && (
        <div className="text-[11px] mt-2" style={{ color: "var(--admin-fg-muted)" }}>
          {trigger.description}
        </div>
      )}
      {measure?.error && (
        <div className="text-[11px] mt-2" style={{ color: "var(--admin-fg-muted)" }}>
          probe: <code>{measure.error}</code>
        </div>
      )}

      {/* Soft mitigation: visibile quando warn/critical */}
      {(status === "warn" || status === "critical") && trigger.softMitigation && (
        <div
          className="mt-2 p-2 rounded text-[11px]"
          style={{
            background: "color-mix(in srgb, #fbbf24 12%, var(--admin-card-bg))",
            color: "var(--admin-fg)",
          }}
        >
          <strong>Escape hatch:</strong> {trigger.softMitigation}
        </div>
      )}

      {/* Action link */}
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-[10px] font-medium uppercase tracking-wide" style={{ color: style.fg }}>
          {style.label}
        </span>
        {trigger.action.docsHref.startsWith("http") ? (
          <a
            href={trigger.action.docsHref}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] inline-flex items-center gap-1 hover:underline"
            style={{ color: "var(--admin-accent)" }}
            title={trigger.action.summary}
          >
            Cosa fare <ExternalLink size={10} />
          </a>
        ) : (
          <Link
            href={trigger.action.docsHref}
            className="text-[11px] hover:underline"
            style={{ color: "var(--admin-accent)" }}
            title={trigger.action.summary}
          >
            Cosa fare →
          </Link>
        )}
      </div>
    </div>
  );
}

function SourceBadge({ source }: { source: string }) {
  return (
    <span
      className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
      style={{
        background: "color-mix(in srgb, var(--admin-fg-muted) 14%, transparent)",
        color: "var(--admin-fg-muted)",
      }}
    >
      {source}
    </span>
  );
}

function computeStatus(
  trigger: ScalingTriggerWithSource,
  measure: { value: number | null; error?: string } | null,
): Status {
  if (trigger.manualCheck) return "info";
  if (!measure || measure.value === null || measure.error) return "unknown";

  const v = measure.value;
  const warn = trigger.warnThreshold ?? defaultWarn(trigger);

  if (trigger.direction === "lower-is-worse") {
    if (v < trigger.threshold) return "critical";
    if (v < warn) return "warn";
    return "ok";
  }
  // higher-is-worse
  if (v > trigger.threshold) return "critical";
  if (v > warn) return "warn";
  return "ok";
}

function defaultWarn(trigger: ScalingTriggerWithSource): number {
  return trigger.direction === "lower-is-worse"
    ? trigger.threshold * 1.5
    : trigger.threshold * 0.75;
}

/**
 * Progress bar percent. Per `higher-is-worse`: pct = value / threshold *
 * 100. Per `lower-is-worse`: invertito così la barra cresce verso il
 * critical.
 */
function computePercent(
  trigger: ScalingTriggerWithSource,
  value: number | null,
): number | null {
  if (trigger.manualCheck || value === null) return null;
  if (trigger.threshold <= 0) return null;
  if (trigger.direction === "lower-is-worse") {
    // value alto = bene → barra "piena di verde"
    // value basso = male → barra "vuota"
    const span = trigger.threshold * 2;
    return Math.max(0, Math.min(100, (value / span) * 100));
  }
  return Math.max(0, Math.min(100, (value / trigger.threshold) * 100));
}

function formatNumber(n: number): string {
  if (n >= 1000) {
    if (n < 10_000) return `${(n / 1000).toFixed(1)}K`;
    return `${Math.round(n / 1000)}K`;
  }
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(1);
}
