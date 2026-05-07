import { AdminSectionHeader } from "@/app/(admin)/admin/_components/section-header";
import { getMfaAdminStats } from "@/lib/auth/mfa/admin-stats";
import { getAppSettings } from "@/lib/db/settings-queries";
import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";
import { MfaForm } from "./_components/mfa-form";
import { MfaStatsCard } from "./_components/mfa-stats-card";
import type { MfaMode } from "./_components/mfa-modes";

export async function generateMetadata(): Promise<Metadata> {
  await connection();
  const t = await getTranslations("admin.security.mfa");
  return { title: t("metaTitle") };
}

export const dynamic = "force-dynamic";

function asMode(v: string | undefined | null): MfaMode {
  return v === "required-for-staff" || v === "required-for-all"
    ? v
    : "optional";
}

export default async function MfaPage() {
  const [settings, stats, t] = await Promise.all([
    getAppSettings(),
    getMfaAdminStats(),
    getTranslations("admin.security"),
  ]);

  const initial = {
    enabled: settings["mfa.enabled"] !== "false", // default ON
    mode: asMode(settings["mfa.mode"]),
    gracePeriodDays: Number(settings["mfa.grace_period_days"] ?? 7),
    issuerLabel: settings["mfa.issuer_label"] ?? "",
    appName: settings.app_name ?? "",
  };

  return (
    <div className="space-y-5">
      <AdminSectionHeader
        icon={ShieldCheck}
        breadcrumbLabel={t("breadcrumb")}
        title={t("mfa.pageTitle")}
        subtitle={t("mfa.pageSubtitle")}
      />

      <MfaStatsCard stats={stats} />
      <MfaForm initial={initial} stats={stats} />
    </div>
  );
}
