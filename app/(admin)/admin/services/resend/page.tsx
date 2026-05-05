import { getAppSettings } from "@/lib/db/settings-queries";
import type { Metadata } from "next";
import { ResendForm } from "./_components/resend-form";

export const metadata: Metadata = { title: "Services / Resend" };

export default async function ServicesResendPage() {
  const settings = await getAppSettings();
  return <ResendForm settings={settings} />;
}
