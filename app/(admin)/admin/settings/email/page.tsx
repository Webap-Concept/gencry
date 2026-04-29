import { getAppSettings } from "@/lib/db/settings-queries";
import type { Metadata } from "next";
import { EmailTemplatesTab } from "../tabs/email-templates-tab";

export const metadata: Metadata = { title: "Settings / Email" };

export default async function SettingsEmailPage() {
  const settings = await getAppSettings();
  return <EmailTemplatesTab settings={settings} />;
}
