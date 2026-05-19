import type { Metadata } from "next";
import { getAppSettings } from "@/lib/db/settings-queries";
import { DEFAULT_SYSTEM_PROMPT } from "@/lib/modules/news/rewriter";
import { SettingsForm } from "./_components/settings-form";

export const metadata: Metadata = { title: "News / Settings" };
export const dynamic = "force-dynamic";

export default async function NewsSettingsPage() {
  const settings = await getAppSettings();
  // Passiamo il default al client così "Reset" e "Show default" funzionano
  // senza un'altra server action. È pubblico (vivono nel codice modulo).
  return <SettingsForm settings={settings} defaultSystemPrompt={DEFAULT_SYSTEM_PROMPT} />;
}
