import { getAppSettings } from "@/lib/db/settings-queries";
import type { Metadata } from "next";
import { QstashForm } from "./_components/qstash-form";

export const metadata: Metadata = { title: "Services / QStash" };

export default async function ServicesQstashPage() {
  const settings = await getAppSettings();
  return <QstashForm settings={settings} />;
}
