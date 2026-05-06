// app/(admin)/admin/tests/_components/tests-dashboard.tsx
"use client";
import {
  FlaskConical, Database, Zap, Mail, Globe, Shield,
  CheckCircle2, XCircle, AlertCircle, HelpCircle,
  Clock, ChevronDown, ChevronRight,
  SkipForward, CircleDot, ShieldCheck,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import type { HealthChecks, HealthStatus, ServiceHealth, VitestReport, VitestSuite } from "../actions";

type TFn = ReturnType<typeof useTranslations<"admin.tests">>;

function statusIcon(status: HealthStatus, size = 16) {
  switch (status) {
    case "ok":       return <CheckCircle2 size={size} style={{ color: "var(--admin-success, #4ade80)" }} />;
    case "degraded": return <AlertCircle  size={size} style={{ color: "var(--admin-warning, #fb923c)" }} />;
    case "error":    return <XCircle      size={size} style={{ color: "var(--admin-danger, #f87171)" }} />;
    // unknown = not configured = warning (yellow)
    default:         return <HelpCircle   size={size} style={{ color: "var(--admin-warning, #fb923c)" }} />;
  }
}

function statusLabel(status: HealthStatus, t: TFn) {
  switch (status) {
    case "ok":       return t("statusLabel.ok");
    case "degraded": return t("statusLabel.degraded");
    case "error":    return t("statusLabel.error");
    default:         return t("statusLabel.unknown");
  }
}

function statusBg(status: HealthStatus) {
  switch (status) {
    case "ok":       return "color-mix(in srgb, #4ade80 8%, var(--admin-card-bg, #1c1b19))";
    case "degraded": return "color-mix(in srgb, #fb923c 8%, var(--admin-card-bg, #1c1b19))";
    case "error":    return "color-mix(in srgb, #f87171 8%, var(--admin-card-bg, #1c1b19))";
    // unknown = same yellow tint as degraded/warning
    default:         return "color-mix(in srgb, #fb923c 8%, var(--admin-card-bg, #1c1b19))";
  }
}

function statusBorder(status: HealthStatus) {
  switch (status) {
    case "ok":       return "color-mix(in srgb, #4ade80 22%, transparent)";
    case "degraded": return "color-mix(in srgb, #fb923c 22%, transparent)";
    case "error":    return "color-mix(in srgb, #f87171 22%, transparent)";
    // unknown = yellow border
    default:         return "color-mix(in srgb, #fb923c 22%, transparent)";
  }
}

function serviceIcon(nameKey: ServiceHealth["nameKey"]) {
  if (nameKey === "redis")      return <Zap      size={15} style={{ color: "var(--admin-accent)" }} />;
  if (nameKey === "resend")     return <Mail     size={15} style={{ color: "var(--admin-accent)" }} />;
  if (nameKey === "google")     return <Globe    size={15} style={{ color: "var(--admin-accent)" }} />;
  if (nameKey === "cloudflare") return <Shield   size={15} style={{ color: "var(--admin-accent)" }} />;
  return                                <Database size={15} style={{ color: "var(--admin-accent)" }} />;
}

function fmt(iso: string, locale: string) {
  const dl = locale === "en" ? "en-GB" : "it-IT";
  return new Date(iso).toLocaleString(dl, {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function fmtEpoch(ms: number, locale: string) {
  const dl = locale === "en" ? "en-GB" : "it-IT";
  return new Date(ms).toLocaleString(dl, {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function ServiceCard({ service, t }: { service: ServiceHealth; t: TFn }) {
  const detailText =
    service.detail?.kind === "key"
      ? t(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          `serviceDetail.${service.detail.key}` as any,
          service.detail.params,
        )
      : service.detail?.text;
  return (
    <div style={{
      background: statusBg(service.status),
      border: `1px solid ${statusBorder(service.status)}`,
      borderRadius: 12, padding: "14px 18px",
      display: "flex", flexDirection: "column", gap: 8,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          {serviceIcon(service.nameKey)}
          <span style={{ fontWeight: 600, fontSize: 13, color: "var(--admin-text)" }}>
            {t(`service.${service.nameKey}`)}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          {statusIcon(service.status, 14)}
          <span style={{ fontSize: 12, fontWeight: 500, color: "var(--admin-text-muted)" }}>
            {statusLabel(service.status, t)}
          </span>
        </div>
      </div>
      {service.latencyMs !== null && (
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <Clock size={11} style={{ color: "var(--admin-text-faint)" }} />
          <span style={{ fontSize: 11, color: "var(--admin-text-faint)", fontVariantNumeric: "tabular-nums" }}>
            {service.latencyMs} ms
          </span>
        </div>
      )}
      {detailText && (
        <p style={{
          fontSize: 11, margin: 0, lineHeight: 1.5, wordBreak: "break-word",
          color: service.status === "error"
            ? "var(--admin-danger, #f87171)"
            : service.status === "unknown"
            ? "var(--admin-warning, #fb923c)"
            : "var(--admin-text-muted)",
        }}>
          {detailText}
        </p>
      )}
    </div>
  );
}

function TestDot({ status }: { status: VitestSuite["tests"][number]["status"] }) {
  if (status === "passed")  return <CheckCircle2 size={12} style={{ color: "var(--admin-success, #4ade80)", flexShrink: 0 }} />;
  if (status === "failed")  return <XCircle      size={12} style={{ color: "var(--admin-danger, #f87171)", flexShrink: 0 }} />;
  if (status === "skipped") return <SkipForward  size={12} style={{ color: "var(--admin-text-faint)", flexShrink: 0 }} />;
  return                            <CircleDot    size={12} style={{ color: "var(--admin-text-faint)", flexShrink: 0 }} />;
}

function SuiteRow({ suite, t }: { suite: VitestSuite; t: TFn }) {
  const [open, setOpen] = useState(false);
  const passed = suite.tests.filter((x) => x.status === "passed").length;
  const failed = suite.tests.filter((x) => x.status === "failed").length;
  const total  = suite.tests.length;
  const suiteStatus: HealthStatus = failed > 0 ? "error" : suite.status === "passed" ? "ok" : "degraded";
  const displayName = suite.name.replace(/^tests\//, "");

  return (
    <div style={{
      border: `1px solid ${statusBorder(suiteStatus)}`,
      borderRadius: 10, overflow: "hidden",
      background: statusBg(suiteStatus),
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", display: "flex", alignItems: "center",
          gap: 10, padding: "11px 14px",
          background: "transparent", border: "none",
          cursor: "pointer", textAlign: "left",
        }}
      >
        <span style={{ color: "var(--admin-text-faint)", flexShrink: 0 }}>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        {statusIcon(suiteStatus, 14)}
        <span style={{
          flex: 1, fontSize: 12, fontFamily: "monospace",
          color: "var(--admin-text)", wordBreak: "break-all",
        }}>
          {displayName}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {failed > 0 && (
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-danger, #f87171)", fontVariantNumeric: "tabular-nums" }}>
              {t("suite.failedCount", { count: failed })}
            </span>
          )}
          <span style={{ fontSize: 11, color: "var(--admin-text-faint)", fontVariantNumeric: "tabular-nums" }}>
            {t("suite.passedRatio", { passed, total })}
          </span>
          {suite.duration > 0 && (
            <span style={{ fontSize: 11, color: "var(--admin-text-faint)", fontVariantNumeric: "tabular-nums" }}>
              {fmtDuration(suite.duration)}
            </span>
          )}
        </div>
      </button>

      {open && (
        <div style={{
          borderTop: "1px solid var(--admin-border)",
          padding: "10px 14px 12px 36px",
          display: "flex", flexDirection: "column", gap: 5,
        }}>
          {suite.tests.map((t, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 7 }}>
              <TestDot status={t.status} />
              <span style={{
                fontSize: 12, lineHeight: 1.4,
                color: t.status === "failed" ? "var(--admin-danger, #f87171)" : "var(--admin-text-muted)",
              }}>
                {t.name}
              </span>
              {t.duration !== undefined && (
                <span style={{
                  fontSize: 10, color: "var(--admin-text-faint)",
                  marginLeft: "auto", flexShrink: 0, fontVariantNumeric: "tabular-nums",
                }}>
                  {fmtDuration(t.duration)}
                </span>
              )}
            </div>
          ))}
          {suite.tests.filter(t => t.failureMessages?.length).map((t, i) => (
            <pre key={`err-${i}`} style={{
              fontSize: 10, lineHeight: 1.5, margin: "4px 0 0",
              padding: "8px 10px",
              background: "color-mix(in srgb, #f87171 6%, var(--admin-card-bg))",
              border: "1px solid color-mix(in srgb, #f87171 15%, transparent)",
              borderRadius: 6, color: "var(--admin-danger, #f87171)",
              whiteSpace: "pre-wrap", wordBreak: "break-word",
              maxHeight: 160, overflowY: "auto",
            }}>
              {t.failureMessages?.join("\n")}
            </pre>
          ))}
        </div>
      )}
    </div>
  );
}

export function TestsDashboard({
  health,
  vitestReport,
}: {
  health: HealthChecks;
  vitestReport: VitestReport | null;
}) {
  const t = useTranslations("admin.tests");
  const locale = useLocale();
  const services: ServiceHealth[] = [
    health.supabase,
    health.redis,
    health.resend,
    health.google,
    health.cloudflare,
  ];

  const allOk    = services.every(s => s.status === "ok");
  const hasError = services.some(s => s.status === "error");
  const globalStatus: HealthStatus = hasError ? "error" : allOk ? "ok" : "degraded";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "color-mix(in srgb, var(--admin-accent) 12%, var(--admin-card-bg))",
          border: "1px solid color-mix(in srgb, var(--admin-accent) 25%, transparent)",
        }}>
          <FlaskConical size={18} style={{ color: "var(--admin-accent)" }} />
        </div>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--admin-text)", margin: 0 }}>
            {t("pageTitle")}
          </h2>
          <p style={{ fontSize: 12, color: "var(--admin-text-faint)", margin: "2px 0 0" }}>
            {t("checkedAt", { date: fmt(health.checkedAt, locale) })}
          </p>
        </div>
      </div>

      {/* Global status banner */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "12px 16px", borderRadius: 10,
        background: statusBg(globalStatus),
        border: `1px solid ${statusBorder(globalStatus)}`,
      }}>
        {statusIcon(globalStatus)}
        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-text)" }}>
          {globalStatus === "ok"
            ? t("globalStatus.allOk")
            : globalStatus === "error"
            ? t("globalStatus.error")
            : t("globalStatus.degraded")}
        </span>
      </div>

      {/* Infrastructure */}
      <section>
        <h3 style={{
          fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
          textTransform: "uppercase", color: "var(--admin-text-faint)",
          margin: "0 0 10px",
        }}>
          {t("infrastructureHeading")}
        </h3>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(min(260px, 100%), 1fr))",
          gap: 10,
        }}>
          {services.map(s => <ServiceCard key={s.nameKey} service={s} t={t} />)}
        </div>
      </section>

      {/* Test Suites */}
      <section>
        {/* CI info banner — above the suites, prominent */}
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 10,
          padding: "10px 14px", marginBottom: 12, borderRadius: 8,
          background: "color-mix(in srgb, var(--admin-accent) 6%, var(--admin-card-bg))",
          border: "1px solid color-mix(in srgb, var(--admin-accent) 18%, transparent)",
        }}>
          <ShieldCheck size={14} style={{ color: "var(--admin-accent)", flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 12, color: "var(--admin-text-muted)", margin: 0, lineHeight: 1.6 }}>
            {t.rich("ciInfo", {
              c: (chunks) => (
                <code style={{ fontFamily: "monospace", fontSize: 11 }}>
                  {chunks}
                </code>
              ),
            })}
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <h3 style={{
            fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
            textTransform: "uppercase", color: "var(--admin-text-faint)", margin: 0,
          }}>
            {t("suitesHeading")}
          </h3>
          {vitestReport && (
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {vitestReport.numFailedTests > 0 && (
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--admin-danger, #f87171)", fontVariantNumeric: "tabular-nums" }}>
                  {t("suitesFailed", { count: vitestReport.numFailedTests })}
                </span>
              )}
              <span style={{ fontSize: 12, color: "var(--admin-text-faint)", fontVariantNumeric: "tabular-nums" }}>
                {t("suitesPassedRatio", {
                  passed: vitestReport.numPassedTests,
                  total: vitestReport.numTotalTests,
                })}
              </span>
              <span style={{ fontSize: 12, color: "var(--admin-text-faint)" }}>
                {t("suitesLastRun", {
                  date: fmtEpoch(vitestReport.startTime, locale),
                })}
              </span>
            </div>
          )}
        </div>

        {vitestReport === null ? (
          <div style={{
            background: "var(--admin-card-bg)",
            border: "1px solid var(--admin-border)",
            borderRadius: 10, padding: "32px 24px", textAlign: "center",
          }}>
            <FlaskConical size={28} style={{ color: "var(--admin-text-faint)", margin: "0 auto 10px" }} />
            <p style={{ fontSize: 13, color: "var(--admin-text-muted)", margin: 0 }}>
              {t("noReportTitle")}
            </p>
            <p style={{ fontSize: 12, color: "var(--admin-text-faint)", margin: "4px 0 0" }}>
              {t.rich("noReportSubtitle", {
                c: (chunks) => (
                  <code style={{ fontFamily: "monospace", fontSize: 11 }}>
                    {chunks}
                  </code>
                ),
              })}
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {vitestReport.suites.map((suite, i) => (
              <SuiteRow key={i} suite={suite} t={t} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
