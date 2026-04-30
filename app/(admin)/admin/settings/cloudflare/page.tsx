import { getAppSettings } from "@/lib/db/settings-queries";
import { CloudflareTab } from "../tabs/cloudflare-tab";

export default async function SettingsCloudfarePage() {
  const settings = await getAppSettings();
  return <CloudflareTab settings={settings} />;
}
