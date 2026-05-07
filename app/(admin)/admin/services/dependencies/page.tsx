import { AdminSectionHeader } from "@/app/(admin)/admin/_components/section-header";
import { AdminSectionInfo } from "@/app/(admin)/admin/_components/section-info";
import { getDependencyReport } from "@/lib/admin/dependencies/registry";
import { Package } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";
import { DependenciesView } from "./_components/dependencies-view";
import { DependenciesGuide } from "./_components/dependencies-guide";

export async function generateMetadata(): Promise<Metadata> {
  // Opt-in dynamic — la pagina chiama npm registry e GitHub API; non
  // ha senso prerendere staticamente. Vedi pattern in /sign-in/page.tsx.
  await connection();
  return { title: "Services / Dependencies" };
}

export default async function DependenciesPage() {
  const [report, t] = await Promise.all([
    getDependencyReport(),
    getTranslations("admin.services"),
  ]);

  return (
    <>
      <AdminSectionHeader
        icon={Package}
        breadcrumbLabel={t("rootTitle")}
        title={t("sections.dependencies.label")}
        subtitle={t("sections.dependencies.description")}
        infoSlot={
          <AdminSectionInfo
            title={t("sections.dependencies.guideTitle")}
            ariaLabel={`${t("guideAriaPrefix")} ${t("sections.dependencies.label")}`}>
            <DependenciesGuide />
          </AdminSectionInfo>
        }
      />
      <DependenciesView report={report} />
    </>
  );
}
