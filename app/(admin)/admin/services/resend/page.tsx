import { AdminSectionHeader } from "@/app/(admin)/admin/_components/section-header";
import { getAppSettings } from "@/lib/db/settings-queries";
import { Send } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ResendForm } from "./_components/resend-form";

export const metadata: Metadata = { title: "Services / Resend" };

export default async function ServicesResendPage() {
  const [settings, t] = await Promise.all([
    getAppSettings(),
    getTranslations("admin.services"),
  ]);
  return (
    <>
      <AdminSectionHeader
        icon={Send}
        breadcrumbLabel={t("rootTitle")}
        title={t("sections.resend.label")}
        subtitle={t("sections.resend.description")}
      />
      <ResendForm settings={settings} />
    </>
  );
}
