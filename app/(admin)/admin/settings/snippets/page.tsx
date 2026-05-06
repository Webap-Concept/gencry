import { AdminSectionHeader } from "@/app/(admin)/admin/_components/section-header";
import { getAllSnippets } from "@/lib/db/snippets-queries";
import { Code2 } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SnippetsTab } from "../tabs/snippets-tab";

export const metadata: Metadata = { title: "Settings / Snippets" };

export default async function SettingsContenutiPage() {
  const [snippets, t] = await Promise.all([
    getAllSnippets(),
    getTranslations("admin.settings"),
  ]);
  return (
    <>
      <AdminSectionHeader
        icon={Code2}
        breadcrumbLabel={t("rootTitle")}
        title={t("sections.snippets.label")}
        subtitle={t("sections.snippets.description")}
      />
      <SnippetsTab initialSnippets={snippets} />
    </>
  );
}
