import { getAppSettings } from "@/lib/db/settings-queries";
import type { Metadata } from "next";
import { CloudflareForm } from "./_components/cloudflare-form";

export const metadata: Metadata = { title: "Services / Cloudflare" };

export default async function ServicesCloudflarePage() {
  const settings = await getAppSettings();
  return <CloudflareForm settings={settings} />;
}
