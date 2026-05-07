import { AdminSectionHeader } from "@/app/(admin)/admin/_components/section-header";
import { getMfaAdminStats } from "@/lib/auth/mfa/admin-stats";
import { getAppSettings } from "@/lib/db/settings-queries";
import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { MfaForm } from "./_components/mfa-form";
import { MfaStatsCard, MfaStatsSkeleton } from "./_components/mfa-stats-card";
import type { MfaMode } from "./_components/mfa-modes";

export async function generateMetadata(): Promise<Metadata> {
  await connection();
  const t = await getTranslations("admin.security.mfa");
  return { title: t("metaTitle") };
}

export const dynamic = "force-dynamic";
// Estende il timeout della function oltre il default (15s su Pro). Le stats
// possono essere lente con DB sotto carico; non vogliamo un 504 mentre il
// form di policy è già renderizzato.
export const maxDuration = 30;

function asMode(v: string | undefined | null): MfaMode {
  return v === "required-for-staff" || v === "required-for-all"
    ? v
    : "optional";
}

export default async function MfaPage() {
  // Settings + i18n in parallelo (entrambi veloci). La stats card è dentro
  // Suspense con un proprio fetch — così se il calcolo stats si impalla,
  // l'admin vede comunque il form e può salvare la policy.
  const [settings, t] = await Promise.all([
    getAppSettings(),
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

      <Suspense fallback={<MfaStatsSkeleton />}>
        <StatsCardLoader />
      </Suspense>

      <MfaForm initial={initial} />
    </div>
  );
}

async function StatsCardLoader() {
  const stats = await getMfaAdminStats();
  return <MfaStatsCard stats={stats} />;
}
