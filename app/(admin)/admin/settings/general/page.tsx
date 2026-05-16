import { getAppSettings } from "@/lib/db/settings-queries";
import type { Metadata } from "next";
import { GeneralTab } from "../tabs/general-tab";

export const metadata: Metadata = { title: "Settings / General" };

export default async function SettingsGeneralePage() {
  const settings = await getAppSettings();
  return <GeneralTab settings={settings} />;
}
