import { AdminSectionHeader } from "@/app/(admin)/admin/_components/section-header";
import { getAppSettings } from "@/lib/db/settings-queries";
import { Database } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";
import { SupabaseForm } from "./_components/supabase-form";

export async function generateMetadata(): Promise<Metadata> {
  await connection();
  return { title: "Services / Supabase" };
}

export default async function ServicesSupabasePage() {
  const [settings, t] = await Promise.all([
    getAppSettings(),
    getTranslations("admin.services"),
  ]);
  return (
    <>
      <AdminSectionHeader
        icon={Database}
        breadcrumbLabel={t("rootTitle")}
        title={t("sections.supabase.label")}
        subtitle={t("sections.supabase.description")}
      />
      <SupabaseForm settings={settings} />
    </>
  );
}
