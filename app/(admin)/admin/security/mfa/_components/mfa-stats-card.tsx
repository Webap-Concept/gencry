import type { MfaAdminStats } from "@/lib/auth/mfa/admin-stats";
import { CheckCircle2, Clock, KeyRound, ShieldCheck, Users } from "lucide-react";
import { getTranslations } from "next-intl/server";

interface MfaStatsCardProps {
  stats: MfaAdminStats;
}

export async function MfaStatsCard({ stats }: MfaStatsCardProps) {
  const t = await getTranslations("admin.security.mfa.stats");

  const adoptionPct =
    stats.totalUsers > 0
      ? Math.round((stats.enrolledUsers / stats.totalUsers) * 100)
      : 0;
  const staffAdoptionPct =
    stats.staffTotal > 0
      ? Math.round((stats.staffEnrolled / stats.staffTotal) * 100)
      : 0;

  return (
    <div
      className="rounded-xl shadow-sm p-5"
      style={{
        background: "var(--admin-card-bg)",
        border: "1px solid var(--admin-card-border)",
      }}>
      <h3
        className="text-sm font-semibold mb-4"
        style={{ color: "var(--admin-text)" }}>
        {t("title")}
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile
          icon={ShieldCheck}
          label={t("enrolled")}
          value={`${stats.enrolledUsers} / ${stats.totalUsers}`}
          hint={`${adoptionPct}%`}
        />
        <StatTile
          icon={Users}
          label={t("staffEnrolled")}
          value={`${stats.staffEnrolled} / ${stats.staffTotal}`}
          hint={`${staffAdoptionPct}%`}
        />
        <StatTile
          icon={Clock}
          label={t("pendingSetups")}
          value={String(stats.pendingSetups)}
        />
        <StatTile
          icon={KeyRound}
          label={t("recoveryUsed30d")}
          value={String(stats.recoveryCodesUsedLast30Days)}
          hint={t("avgRemaining", {
            n: stats.avgRecoveryCodesRemaining,
          })}
        />
      </div>

      {stats.enrolledUsers === 0 && (
        <div
          className="mt-4 flex items-start gap-2 text-xs p-3 rounded-md"
          style={{
            background: "rgba(59, 130, 246, 0.08)",
            color: "var(--admin-text-muted)",
          }}>
          <CheckCircle2
            className="w-4 h-4 flex-shrink-0 mt-0.5"
            style={{ color: "rgb(59, 130, 246)" }}
          />
          <p>{t("noEnrolmentsHint")}</p>
        </div>
      )}
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div
      className="rounded-lg p-3"
      style={{
        background: "var(--admin-page-bg, var(--admin-card-bg))",
        border: "1px solid var(--admin-card-border)",
      }}>
      <div
        className="flex items-center gap-2 text-xs mb-1"
        style={{ color: "var(--admin-text-muted)" }}>
        <Icon className="w-3.5 h-3.5" />
        <span>{label}</span>
      </div>
      <div
        className="text-xl font-semibold"
        style={{ color: "var(--admin-text)" }}>
        {value}
      </div>
      {hint && (
        <div
          className="text-xs mt-0.5"
          style={{ color: "var(--admin-text-muted)" }}>
          {hint}
        </div>
      )}
    </div>
  );
}
