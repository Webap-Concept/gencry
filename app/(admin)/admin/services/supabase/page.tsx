import { getAppSettings } from "@/lib/db/settings-queries";
import type { Metadata } from "next";
import { connection } from "next/server";
import { SupabaseForm } from "./_components/supabase-form";

export async function generateMetadata(): Promise<Metadata> {
  await connection();
  return { title: "Services / Supabase" };
}

export default async function ServicesSupabasePage() {
  const settings = await getAppSettings();
  return <SupabaseForm settings={settings} />;
}
