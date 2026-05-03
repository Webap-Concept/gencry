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
import Link from "next/link";

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

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

export function ConsentStatusDashboard({
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
  // Health computation
  const tableStatus: Status = health.consentRecordsTableExists ? "ok" : "off";
  const tableDetail = health.consentRecordsTableExists
    ? "Table consent_records exists in DB"
    : "Table consent_records not yet created (delivered in PR-1)";

  const triggerStatus: Status = health.consentRecordsImmutable
    ? "ok"
    : health.consentRecordsTableExists
      ? "warn"
      : "off";
  const triggerDetail = health.consentRecordsImmutable
    ? "Trigger DENY UPDATE/DELETE active"
    : health.consentRecordsTableExists
      ? "Table exists but no immutability trigger detected"
      : "Pending — depends on table creation";

  const backupStatus: Status =
    backupTier === "none" ? "warn" : "ok";
  const backupLabel =
    backupTier === "supabase_pitr"
      ? "Supabase PITR"
      : backupTier === "external"
        ? "External"
        : "None declared";

  const logStatus: Status = consentLogEnabled
    ? health.consentRecordsTableExists
      ? "ok"
      : "warn"
    : "off";
  const logDetail = consentLogEnabled
    ? health.consentRecordsTableExists
      ? "Consent events are being written"
      : "Enabled but table missing — no events written"
    : "Off — consent changes are not logged";

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
            <strong>Consent logging enabled but table missing.</strong> Apply
            the migration creating the <code>consent_records</code> table
            (PR-1) before this setting takes effect. Until then, consent events
            are silently dropped.
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
            <strong>Legacy mode.</strong> Consent timestamps and version IDs
            are stored on the <code>users</code> row and can be overwritten
            without an audit trail. Demonstrability under GDPR Art. 7(1) is
            limited. Enable consent logging to fix this.
          </div>
        </div>
      )}

      {/* Health checks */}
      <section>
        <h2
          className="text-sm font-semibold mb-3"
          style={{ color: "var(--admin-text)" }}>
          Compliance health
        </h2>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <StatusBadge
            status={tableStatus}
            label="consent_records table"
            detail={tableDetail}
            Icon={Database}
          />
          <StatusBadge
            status={triggerStatus}
            label="Immutability trigger"
            detail={triggerDetail}
            Icon={FileLock2}
          />
          <StatusBadge
            status={backupStatus}
            label={`Backup: ${backupLabel}`}
            detail={
              backupStatus === "warn"
                ? "Set a backup tier in Settings to suppress this warning"
                : "Declared in GDPR settings"
            }
            Icon={ShieldCheck}
          />
          <StatusBadge
            status={logStatus}
            label="Consent ledger"
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
          Current policy versions
        </h2>
        <div className="grid gap-3 md:grid-cols-3">
          <StatTile
            label="Terms"
            value={stats.currentVersions.terms ?? "—"}
            hint={`Updated ${fmtDate(stats.policyUpdatedAt.terms)}`}
          />
          <StatTile
            label="Privacy"
            value={stats.currentVersions.privacy ?? "—"}
            hint={`Updated ${fmtDate(stats.policyUpdatedAt.privacy)}`}
          />
          <StatTile
            label="Marketing"
            value={stats.currentVersions.marketing ?? "—"}
            hint={`Updated ${fmtDate(stats.policyUpdatedAt.marketing)}`}
          />
        </div>
        <div className="mt-2 text-[11px]">
          <Link
            href={pagesAdminPath}
            className="underline"
            style={{ color: "var(--admin-text-muted)" }}>
            Manage policy texts in Content → Pages →
          </Link>
        </div>
      </section>

      {/* Consent metrics */}
      <section>
        <h2
          className="text-sm font-semibold mb-3"
          style={{ color: "var(--admin-text)" }}>
          User consents (active accounts)
        </h2>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Total active users" value={stats.totalUsers} />
          <StatTile
            label="Terms accepted"
            value={stats.usersWithTermsAccepted}
            hint={
              stats.totalUsers > 0
                ? `${Math.round(
                    (stats.usersWithTermsAccepted / stats.totalUsers) * 100,
                  )}% of active users`
                : undefined
            }
          />
          <StatTile
            label="Privacy accepted"
            value={stats.usersWithPrivacyAccepted}
            hint={
              stats.totalUsers > 0
                ? `${Math.round(
                    (stats.usersWithPrivacyAccepted / stats.totalUsers) * 100,
                  )}% of active users`
                : undefined
            }
          />
          <StatTile
            label="Marketing opt-in"
            value={stats.usersWithMarketingActive}
            hint={
              stats.totalUsers > 0
                ? `${Math.round(
                    (stats.usersWithMarketingActive / stats.totalUsers) * 100,
                  )}% of active users`
                : undefined
            }
          />
          <StatTile
            label="Stale terms"
            value={stats.usersWithStaleTerms}
            warning={stats.usersWithStaleTerms > 0}
            hint="Users on a previous terms version"
          />
          <StatTile
            label="Stale privacy"
            value={stats.usersWithStalePrivacy}
            warning={stats.usersWithStalePrivacy > 0}
            hint="Users on a previous privacy version"
          />
          <StatTile
            label="In deletion grace"
            value={stats.usersInDeletionGrace}
            hint="Soft-deleted, awaiting purge"
          />
          <StatTile
            label="Export jobs (30d)"
            value={
              stats.exportJobsRecent.pending +
              stats.exportJobsRecent.processing +
              stats.exportJobsRecent.ready +
              stats.exportJobsRecent.failed +
              stats.exportJobsRecent.expired
            }
            hint={`${stats.exportJobsRecent.ready} ready, ${stats.exportJobsRecent.failed} failed`}
          />
        </div>
      </section>
    </div>
  );
}
