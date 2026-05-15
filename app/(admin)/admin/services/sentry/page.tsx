import { getAppSettings } from "@/lib/db/settings-queries";
import type { Metadata } from "next";
import { SentryForm } from "./_components/sentry-form";

export const metadata: Metadata = { title: "Services / Sentry" };

export default async function ServicesSentryPage() {
  const settings = await getAppSettings();
  return <SentryForm settings={settings} />;
}
