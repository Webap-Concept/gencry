import { AdminSectionHeader } from "@/app/(admin)/admin/_components/section-header";
import { getAppSettings } from "@/lib/db/settings-queries";
import { GitMerge } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { GitHubCIForm } from "./_components/github-ci-form";

export const metadata: Metadata = { title: "Services / GitHub CI" };

export default async function ServicesGitHubPage() {
  const [settings, t] = await Promise.all([
    getAppSettings(),
    getTranslations("admin.services"),
  ]);
  return (
    <>
      <AdminSectionHeader
        icon={GitMerge}
        breadcrumbLabel={t("rootTitle")}
        title={t("sections.github.label")}
        subtitle={t("sections.github.description")}
      />
      <GitHubCIForm settings={settings} />
    </>
  );
}
