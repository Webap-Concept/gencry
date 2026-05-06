import type {
  GdprDashboardStats,
  GdprHealthChecks,
} from "@/lib/account/gdpr-stats";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  FileLock2,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";

type DashboardT = Awaited<
  ReturnType<typeof getTranslations<"admin.compliance.gdpr.dashboard">>
>;

const cardStyle: React.CSSProperties = {
  background: "var(--admin-card-bg)",
  border: "1px solid var(--admin-card-border)",
};

type Status = "ok" | "warn" | "off";

function statusColor(s: Status): string {
  if (s === "ok") return "var(--admin-success, #16a34a)";
  if (s === "warn") return "var(--admin-warning, #ca8a04)";
  return "var(--admin-text-faint)";
}

function StatusBadge({
  status,
  label,
  detail,
  Icon,
}: {
  status: Status;
  label: string;
  detail: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
}) {
  return (
    <div
      className="flex items-start gap-2.5 rounded-lg p-3"
      style={{
        background: "var(--admin-page-bg)",
        border: "1px solid var(--admin-card-border)",
      }}>
      <Icon size={16} className="shrink-0 mt-0.5" />
      <div className="min-w-0">
        <div
          className="text-xs font-semibold flex items-center gap-1.5"
          style={{ color: "var(--admin-text)" }}>
          <span
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{ background: statusColor(status) }}
          />
          {label}
        </div>
        <div
          className="text-[11px] mt-0.5 truncate"
          style={{ color: "var(--admin-text-faint)" }}>
          {detail}
        </div>
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  hint,
  warning,
}: {
  label: string;
  value: number | string;
  hint?: string;
  warning?: boolean;
}) {
  return (
    <div className="rounded-lg p-4" style={cardStyle}>
      <div
        className="text-[11px] uppercase tracking-wide font-medium mb-1.5"
        style={{ color: "var(--admin-text-faint)" }}>
        {label}
      </div>
      <div
        className="text-2xl font-semibold"
        style={{
          color: warning ? "var(--admin-warning, #ca8a04)" : "var(--admin-text)",
        }}>
        {value}
      </div>
      {hint && (
        <div
          className="text-[11px] mt-1"
          style={{ color: "var(--admin-text-faint)" }}>
          {hint}
        </div>
      )}
    </div>
  );
}

function fmtDate(d: Date | null, dateLocale: string): string {
  if (!d) return "—";
  return d.toLocaleDateString(dateLocale, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

export async function ConsentStatusDashboard({
  stats,
  health,
  consentLogEnabled,
  backupTier,
  pagesAdminPath,
}: {
  stats: GdprDashboardStats;
  health: GdprHealthChecks;
  consentLogEnabled: boolean;
  backupTier: string;
  pagesAdminPath: string;
}) {
  const t = await getTranslations("admin.compliance.gdpr.dashboard");
  const locale = await getLocale();
  const dateLocale = locale === "en" ? "en-GB" : "it-IT";

  // Health computation
  const tableStatus: Status = health.consentRecordsTableExists ? "ok" : "off";
  const tableDetail = health.consentRecordsTableExists
    ? t("healthTableExists")
    : t("healthTableMissing");

  const triggerStatus: Status = health.consentRecordsImmutable
    ? "ok"
    : health.consentRecordsTableExists
      ? "warn"
      : "off";
  const triggerDetail = health.consentRecordsImmutable
    ? t("healthTriggerActive")
    : health.consentRecordsTableExists
      ? t("healthTriggerWarn")
      : t("healthTriggerOff");

  const backupStatus: Status =
    backupTier === "none" ? "warn" : "ok";
  const backupLabel =
    backupTier === "supabase_pitr"
      ? t("healthBackupTierPitr")
      : backupTier === "external"
        ? t("healthBackupTierExternal")
        : t("healthBackupTierNone");

  const logStatus: Status = consentLogEnabled
    ? health.consentRecordsTableExists
      ? "ok"
      : "warn"
    : "off";
  const logDetail = consentLogEnabled
    ? health.consentRecordsTableExists
      ? t("healthLogActive")
      : t("healthLogEnabledMissingTable")
    : t("healthLogOff");

  const showWarningBanner = consentLogEnabled && !health.consentRecordsTableExists;
  const showLegacyBanner = !consentLogEnabled;

  return (
    <div className="space-y-5">
      {showWarningBanner && (
        <div
          className="rounded-xl p-4 text-xs flex items-start gap-2.5"
          style={{
            background: "color-mix(in srgb, #ca8a04 10%, var(--admin-card-bg))",
            border: "1px solid color-mix(in srgb, #ca8a04 30%, transparent)",
            color: "var(--admin-text)",
          }}>
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <div>
            {t.rich("warningBanner", {
              strong: (chunks) => <strong>{chunks}</strong>,
              c: (chunks) => <code>{chunks}</code>,
            })}
          </div>
        </div>
      )}

      {showLegacyBanner && (
        <div
          className="rounded-xl p-4 text-xs flex items-start gap-2.5"
          style={{
            background:
              "color-mix(in srgb, var(--admin-text-faint) 8%, var(--admin-card-bg))",
            border: "1px solid var(--admin-card-border)",
            color: "var(--admin-text-muted)",
          }}>
          <ShieldAlert size={14} className="shrink-0 mt-0.5" />
          <div>
            {t.rich("legacyBanner", {
              strong: (chunks) => <strong>{chunks}</strong>,
              c: (chunks) => <code>{chunks}</code>,
            })}
          </div>
        </div>
      )}

      {/* Health checks */}
      <section>
        <h2
          className="text-sm font-semibold mb-3"
          style={{ color: "var(--admin-text)" }}>
          {t("healthHeading")}
        </h2>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <StatusBadge
            status={tableStatus}
            label={t("healthTableLabel")}
            detail={tableDetail}
            Icon={Database}
          />
          <StatusBadge
            status={triggerStatus}
            label={t("healthTriggerLabel")}
            detail={triggerDetail}
            Icon={FileLock2}
          />
          <StatusBadge
            status={backupStatus}
            label={t("healthBackupLabel", { tier: backupLabel })}
            detail={
              backupStatus === "warn"
                ? t("healthBackupWarnDetail")
                : t("healthBackupOkDetail")
            }
            Icon={ShieldCheck}
          />
          <StatusBadge
            status={logStatus}
            label={t("healthLogLabel")}
            detail={logDetail}
            Icon={CheckCircle2}
          />
        </div>
      </section>

      {/* Policy versions */}
      <section>
        <h2
          className="text-sm font-semibold mb-3"
          style={{ color: "var(--admin-text)" }}>
          {t("policyVersionsHeading")}
        </h2>
        <div className="grid gap-3 md:grid-cols-3">
          <StatTile
            label={t("policyTermsLabel")}
            value={stats.currentVersions.terms ?? "—"}
            hint={t("policyUpdatedHint", {
              date: fmtDate(stats.policyUpdatedAt.terms, dateLocale),
            })}
          />
          <StatTile
            label={t("policyPrivacyLabel")}
            value={stats.currentVersions.privacy ?? "—"}
            hint={t("policyUpdatedHint", {
              date: fmtDate(stats.policyUpdatedAt.privacy, dateLocale),
            })}
          />
          <StatTile
            label={t("policyMarketingLabel")}
            value={stats.currentVersions.marketing ?? "—"}
            hint={t("policyUpdatedHint", {
              date: fmtDate(stats.policyUpdatedAt.marketing, dateLocale),
            })}
          />
        </div>
        <div className="mt-2 text-[11px]">
          <Link
            href={pagesAdminPath}
            className="underline"
            style={{ color: "var(--admin-text-muted)" }}>
            {t("policyManageLink")}
          </Link>
        </div>
      </section>

      {/* Consent metrics */}
      <section>
        <h2
          className="text-sm font-semibold mb-3"
          style={{ color: "var(--admin-text)" }}>
          {t("consentsHeading")}
        </h2>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <StatTile label={t("tileTotalUsers")} value={stats.totalUsers} />
          <StatTile
            label={t("tileTermsAccepted")}
            value={stats.usersWithTermsAccepted}
            hint={
              stats.totalUsers > 0
                ? t("tilePctHint", {
                    pct: Math.round(
                      (stats.usersWithTermsAccepted / stats.totalUsers) * 100,
                    ),
                  })
                : undefined
            }
          />
          <StatTile
            label={t("tilePrivacyAccepted")}
            value={stats.usersWithPrivacyAccepted}
            hint={
              stats.totalUsers > 0
                ? t("tilePctHint", {
                    pct: Math.round(
                      (stats.usersWithPrivacyAccepted / stats.totalUsers) *
                        100,
                    ),
                  })
                : undefined
            }
          />
          <StatTile
            label={t("tileMarketingActive")}
            value={stats.usersWithMarketingActive}
            hint={
              stats.totalUsers > 0
                ? t("tilePctHint", {
                    pct: Math.round(
                      (stats.usersWithMarketingActive / stats.totalUsers) *
                        100,
                    ),
                  })
                : undefined
            }
          />
          <StatTile
            label={t("tileStaleTerms")}
            value={stats.usersWithStaleTerms}
            warning={stats.usersWithStaleTerms > 0}
            hint={t("tileStaleTermsHint")}
          />
          <StatTile
            label={t("tileStalePrivacy")}
            value={stats.usersWithStalePrivacy}
            warning={stats.usersWithStalePrivacy > 0}
            hint={t("tileStalePrivacyHint")}
          />
          <StatTile
            label={t("tileInDeletionGrace")}
            value={stats.usersInDeletionGrace}
            hint={t("tileDeletionGraceHint")}
          />
          <StatTile
            label={t("tileExportJobs")}
            value={
              stats.exportJobsRecent.pending +
              stats.exportJobsRecent.processing +
              stats.exportJobsRecent.ready +
              stats.exportJobsRecent.failed +
              stats.exportJobsRecent.expired
            }
            hint={t("tileExportJobsHint", {
              ready: stats.exportJobsRecent.ready,
              failed: stats.exportJobsRecent.failed,
            })}
          />
        </div>
      </section>
    </div>
  );
}
