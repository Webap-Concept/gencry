import type { Metadata } from "next";
import { getAppSettings } from "@/lib/db/settings-queries";
import { SettingsForm } from "./_components/settings-form";

export const metadata: Metadata = { title: "News / Settings" };
export const dynamic = "force-dynamic";

export default async function NewsSettingsPage() {
  const settings = await getAppSettings();
  return <SettingsForm settings={settings} />;
}
