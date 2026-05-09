import { AdminSectionHeader } from "@/app/(admin)/admin/_components/section-header";
import { getAppSettings } from "@/lib/db/settings-queries";
import { Bug } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SentryForm } from "./_components/sentry-form";

export const metadata: Metadata = { title: "Services / Sentry" };

export default async function ServicesSentryPage() {
  const [settings, t] = await Promise.all([
    getAppSettings(),
    getTranslations("admin.services"),
  ]);
  return (
    <>
      <AdminSectionHeader
        icon={Bug}
        breadcrumbLabel={t("rootTitle")}
        title={t("sections.sentry.label")}
        subtitle={t("sections.sentry.description")}
      />
      <SentryForm settings={settings} />
    </>
  );
}
