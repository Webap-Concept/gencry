"use client";

import type {
  DependabotPrInfo,
  DependencyInfo,
  DependencyReport,
  RiskLevel,
} from "@/lib/admin/dependencies/types";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Circle,
  ExternalLink,
  FileText,
  Loader2,
  RefreshCw,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { refreshDependencyReportAction } from "../actions";

export function DependenciesView({ report }: { report: DependencyReport }) {
  const t = useTranslations("admin.services.dependencies");
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [showOnlyOutdated, setShowOnlyOutdated] = useState(true);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const generatedAt = useMemo(() => {
    try {
      return new Date(report.generatedAt).toLocaleString();
    } catch {
      return report.generatedAt;
    }
  }, [report.generatedAt]);

  function handleRefresh() {
    setRefreshError(null);
    startRefresh(async () => {
      const res = await refreshDependencyReportAction();
      if ("error" in res) setRefreshError(res.error);
      router.refresh();
    });
  }

  const prodOutdated = report.production.filter((d) => d.risk !== "current").length;
  const devOutdated = report.development.filter((d) => d.risk !== "current").length;
  const vulnerableCount =
    report.production.filter((d) => d.risk === "vulnerable").length +
    report.development.filter((d) => d.risk === "vulnerable").length;

  return (
    <div className="space-y-8">
      {/* Toolbar */}
      <div
        className="rounded-xl p-4 flex flex-wrap items-center gap-4 justify-between"
        style={{
          background: "var(--admin-card-bg)",
          border: "1px solid var(--admin-card-border)",
        }}>
        <div className="flex flex-wrap items-center gap-4">
          <Stat label={t("stats.production")} value={`${prodOutdated}/${report.production.length}`} />
          <Stat label={t("stats.development")} value={`${devOutdated}/${report.development.length}`} />
          <Stat
            label={t("stats.vulnerable")}
            value={String(vulnerableCount)}
            tone={vulnerableCount > 0 ? "danger" : "muted"}
          />
          <Stat label={t("stats.lastRun")} value={generatedAt} mono />
        </div>
        <div className="flex items-center gap-3">
          <label
            className="inline-flex items-center gap-2 text-xs"
            style={{ color: "var(--admin-text-muted)" }}>
            <input
              type="checkbox"
              checked={showOnlyOutdated}
              onChange={(e) => setShowOnlyOutdated(e.target.checked)}
              className="accent-current"
              style={{ accentColor: "var(--admin-accent)" }}
            />
            {t("toolbar.onlyOutdated")}
          </label>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg disabled:opacity-60"
            style={{
              background: "var(--admin-input-bg)",
              border: "1px solid var(--admin-input-border)",
              color: "var(--admin-text-muted)",
            }}>
            {refreshing ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <RefreshCw size={12} />
            )}
            {refreshing ? t("toolbar.refreshing") : t("toolbar.refresh")}
          </button>
        </div>
      </div>

      {refreshError && (
        <div
          className="px-3 py-2 rounded-lg text-sm"
          style={{
            background: "color-mix(in srgb, #ef4444 8%, var(--admin-card-bg))",
            border: "1px solid color-mix(in srgb, #ef4444 25%, transparent)",
            color: "#ef4444",
          }}>
          {refreshError}
        </div>
      )}

      {report.globalErrors.length > 0 && (
        <div
          className="px-3 py-2 rounded-lg text-sm space-y-1"
          style={{
            background: "color-mix(in srgb, #f59e0b 8%, var(--admin-card-bg))",
            border: "1px solid color-mix(in srgb, #f59e0b 25%, transparent)",
            color: "#f59e0b",
          }}>
          {report.globalErrors.map((e, i) => (
            <div key={i} className="flex items-center gap-2">
              <AlertTriangle size={13} /> {e}
            </div>
          ))}
        </div>
      )}

      {report.groupedDependabotPrs.length > 0 && (
        <GroupedPrsBox prs={report.groupedDependabotPrs} />
      )}

      <DependencySection
        title={t("sections.production")}
        deps={report.production}
        showOnlyOutdated={showOnlyOutdated}
      />

      <DependencySection
        title={t("sections.development")}
        deps={report.development}
        showOnlyOutdated={showOnlyOutdated}
      />
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function Stat({
  label,
  value,
  tone = "default",
  mono = false,
}: {
  label: string;
  value: string;
  tone?: "default" | "muted" | "danger";
  mono?: boolean;
}) {
  const color =
    tone === "danger"
      ? "#ef4444"
      : tone === "muted"
        ? "var(--admin-text-faint)"
        : "var(--admin-text)";
  return (
    <div className="flex flex-col">
      <span
        className="text-[10px] uppercase tracking-wider font-semibold"
        style={{ color: "var(--admin-text-faint)" }}>
        {label}
      </span>
      <span
        className={mono ? "text-xs font-mono" : "text-sm font-semibold"}
        style={{ color }}>
        {value}
      </span>
    </div>
  );
}

function DependencySection({
  title,
  deps,
  showOnlyOutdated,
}: {
  title: string;
  deps: DependencyInfo[];
  showOnlyOutdated: boolean;
}) {
  const t = useTranslations("admin.services.dependencies");
  const filtered = showOnlyOutdated
    ? deps.filter((d) => d.risk !== "current")
    : deps;

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-sm font-semibold" style={{ color: "var(--admin-text)" }}>
          {title}
        </h2>
        <span
          className="text-xs px-1.5 py-0.5 rounded-full"
          style={{
            background:
              "color-mix(in srgb, var(--admin-text-faint) 12%, var(--admin-card-bg))",
            color: "var(--admin-text-faint)",
          }}>
          {filtered.length}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div
          className="text-xs px-4 py-6 rounded-xl text-center"
          style={{
            border: "1px dashed var(--admin-card-border)",
            color: "var(--admin-text-faint)",
          }}>
          {t("empty.allCurrent")}
        </div>
      ) : (
        <ul
          className="rounded-xl overflow-hidden"
          style={{
            background: "var(--admin-card-bg)",
            border: "1px solid var(--admin-card-border)",
          }}>
          {filtered.map((d, i) => (
            <DependencyRow key={d.name} dep={d} isFirst={i === 0} />
          ))}
        </ul>
      )}
    </section>
  );
}

function DependencyRow({
  dep,
  isFirst,
}: {
  dep: DependencyInfo;
  isFirst: boolean;
}) {
  const t = useTranslations("admin.services.dependencies");

  return (
    <li
      className="grid gap-3 px-4 py-3"
      style={{
        gridTemplateColumns: "1.6fr 1.2fr 1fr 1.4fr",
        borderTop: isFirst ? undefined : "1px solid var(--admin-card-border)",
      }}>
      {/* Col 1: name + description */}
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <a
            href={
              dep.homepage ??
              `https://www.npmjs.com/package/${dep.name}`
            }
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium font-mono hover:underline"
            style={{ color: "var(--admin-text)" }}>
            {dep.name}
          </a>
          <RiskBadge risk={dep.risk} />
        </div>
        {dep.description && (
          <p
            className="text-[11px] mt-0.5 truncate"
            style={{ color: "var(--admin-text-faint)" }}>
            {dep.description}
          </p>
        )}
      </div>

      {/* Col 2: versions */}
      <div className="min-w-0 flex items-center gap-2 flex-wrap">
        <span
          className="text-xs font-mono"
          style={{ color: "var(--admin-text-muted)" }}>
          {dep.installed}
        </span>
        {dep.latest && dep.latest !== dep.installed && (
          <>
            <ArrowRight size={11} style={{ color: "var(--admin-text-faint)" }} />
            <span
              className="text-xs font-mono font-semibold"
              style={{ color: "var(--admin-accent)" }}>
              {dep.latest}
            </span>
            <BumpBadge bump={dep.bump} />
          </>
        )}
      </div>

      {/* Col 3: usage + breaking */}
      <div className="min-w-0 flex flex-col gap-1">
        <span
          className="text-[11px]"
          style={{ color: "var(--admin-text-muted)" }}
          title={t("row.usageTooltip")}>
          {t("row.usage", { count: dep.usageCount })}
        </span>
        {dep.hasBreakingChanges === true && (
          <span
            className="inline-flex items-center gap-1 text-[10.5px] font-medium"
            style={{ color: "#f59e0b" }}>
            <AlertTriangle size={10} /> {t("row.breakingDetected")}
          </span>
        )}
        {dep.hasBreakingChanges === false &&
          (dep.bump === "major" || dep.bump === "minor") && (
            <span
              className="inline-flex items-center gap-1 text-[10.5px]"
              style={{ color: "#10b981" }}>
              <CheckCircle2 size={10} /> {t("row.noBreaking")}
            </span>
          )}
      </div>

      {/* Col 4: links */}
      <div className="min-w-0 flex flex-col items-end gap-1">
        {dep.dependabotPr ? (
          <a
            href={dep.dependabotPr.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] hover:underline"
            style={{ color: "var(--admin-text-muted)" }}>
            <CiBadge status={dep.dependabotPr.ciStatus} />
            {t("row.dependabotPr", { number: dep.dependabotPr.number })}
            <ExternalLink size={10} />
          </a>
        ) : null}
        {dep.changelogUrl && (
          <a
            href={dep.changelogUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] hover:underline"
            style={{ color: "var(--admin-text-faint)" }}>
            <FileText size={10} />
            {t("row.changelog")}
            <ExternalLink size={10} />
          </a>
        )}
        {dep.error && (
          <span className="text-[10px]" style={{ color: "#ef4444" }}>
            {dep.error}
          </span>
        )}
      </div>
    </li>
  );
}

function RiskBadge({ risk }: { risk: RiskLevel }) {
  const t = useTranslations("admin.services.dependencies.risk");
  const styles: Record<
    RiskLevel,
    { bg: string; color: string; icon: React.ReactNode }
  > = {
    current: {
      bg: "color-mix(in srgb, var(--admin-text-faint) 10%, transparent)",
      color: "var(--admin-text-faint)",
      icon: <Circle size={9} />,
    },
    low: {
      bg: "color-mix(in srgb, #10b981 12%, transparent)",
      color: "#10b981",
      icon: <CheckCircle2 size={9} />,
    },
    medium: {
      bg: "color-mix(in srgb, #f59e0b 12%, transparent)",
      color: "#f59e0b",
      icon: <AlertTriangle size={9} />,
    },
    high: {
      bg: "color-mix(in srgb, #ef4444 14%, transparent)",
      color: "#ef4444",
      icon: <AlertTriangle size={9} />,
    },
    vulnerable: {
      bg: "color-mix(in srgb, #ef4444 22%, transparent)",
      color: "#ef4444",
      icon: <ShieldAlert size={9} />,
    },
  };
  const s = styles[risk];
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full uppercase tracking-wider"
      style={{ background: s.bg, color: s.color }}>
      {s.icon}
      {t(risk)}
    </span>
  );
}

function BumpBadge({ bump }: { bump: DependencyInfo["bump"] }) {
  const t = useTranslations("admin.services.dependencies.bump");
  if (bump === "current") return null;
  const colors: Record<string, string> = {
    patch: "#10b981",
    minor: "#3b82f6",
    major: "#ef4444",
    prerelease: "#a855f7",
    unknown: "var(--admin-text-faint)",
  };
  return (
    <span
      className="text-[10px] font-medium px-1.5 py-0.5 rounded-full uppercase tracking-wider"
      style={{
        background: `color-mix(in srgb, ${colors[bump]} 12%, transparent)`,
        color: colors[bump],
      }}>
      {t(bump)}
    </span>
  );
}

function CiBadge({
  status,
}: {
  status: DependabotPrInfo["ciStatus"];
}) {
  if (status === "success") {
    return <CheckCircle2 size={11} style={{ color: "#10b981" }} />;
  }
  if (status === "failure") {
    return <XCircle size={11} style={{ color: "#ef4444" }} />;
  }
  if (status === "pending") {
    return <Loader2 size={11} className="animate-spin" style={{ color: "#f59e0b" }} />;
  }
  return <Circle size={11} style={{ color: "var(--admin-text-faint)" }} />;
}

function GroupedPrsBox({ prs }: { prs: DependabotPrInfo[] }) {
  const t = useTranslations("admin.services.dependencies");
  return (
    <div
      className="rounded-xl p-4"
      style={{
        background: "var(--admin-card-bg)",
        border: "1px solid var(--admin-card-border)",
      }}>
      <h3 className="text-xs font-semibold mb-2" style={{ color: "var(--admin-text)" }}>
        {t("groupedPrs.title")}
      </h3>
      <p className="text-[11px] mb-3" style={{ color: "var(--admin-text-faint)" }}>
        {t("groupedPrs.description")}
      </p>
      <ul className="space-y-1.5">
        {prs.map((pr) => (
          <li key={pr.number} className="flex items-center gap-2 text-xs">
            <CiBadge status={pr.ciStatus} />
            <a
              href={pr.url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
              style={{ color: "var(--admin-text-muted)" }}>
              #{pr.number} — {pr.title}
            </a>
            {pr.hasSecurityLabel && (
              <span
                className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                style={{
                  background: "color-mix(in srgb, #ef4444 18%, transparent)",
                  color: "#ef4444",
                }}>
                <ShieldAlert size={9} /> {t("groupedPrs.securityBadge")}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
