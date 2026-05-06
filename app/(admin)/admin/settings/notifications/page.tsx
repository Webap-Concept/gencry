import { AdminSectionHeader } from "@/app/(admin)/admin/_components/section-header";
import { getAlertsConfig } from "@/lib/sessions/suspicious/config";
import { Bell } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { NotificationsSettingsForm } from "./_components/notifications-form";

export const metadata: Metadata = { title: "Settings / Notifications" };

export default async function SettingsNotificationsPage() {
  const [config, t] = await Promise.all([
    getAlertsConfig(),
    getTranslations("admin.settings"),
  ]);
  return (
    <>
      <AdminSectionHeader
        icon={Bell}
        breadcrumbLabel={t("rootTitle")}
        title={t("sections.notifications.label")}
        subtitle={t("sections.notifications.description")}
      />
      <NotificationsSettingsForm initialConfig={config} />
    </>
  );
}
