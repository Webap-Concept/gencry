import { getAlertsConfig } from "@/lib/sessions/suspicious/config";
import type { Metadata } from "next";
import { NotificationsSettingsForm } from "./_components/notifications-form";

export const metadata: Metadata = { title: "Settings / Notifications" };

export default async function SettingsNotificationsPage() {
  const config = await getAlertsConfig();
  return <NotificationsSettingsForm initialConfig={config} />;
}
