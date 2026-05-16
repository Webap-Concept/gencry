import { getAppSettings } from "@/lib/db/settings-queries";
import type { Metadata } from "next";
import { ModeTab } from "../tabs/mode-tab";

export const metadata: Metadata = { title: "Settings / Operation Mode" };

export default async function SettingsModePage() {
  const settings = await getAppSettings();
  return <ModeTab settings={settings} />;
}
