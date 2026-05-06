// app/(admin)/admin/tests/page.tsx
import { AdminSectionHeader } from "@/app/(admin)/admin/_components/section-header";
import { requireAdminPage } from "@/lib/rbac/guards";
import { FlaskConical } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { TestsDashboard } from "./_components/tests-dashboard";
import { getHealthChecks, getVitestReport } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.tests");
  return { title: t("metaTitle") };
}

export default async function AdminTestsPage() {
  await requireAdminPage();
  const [health, vitestReport, t] = await Promise.all([
    getHealthChecks(),
    getVitestReport(),
    getTranslations("admin.tests"),
  ]);
  return (
    <div className="space-y-5">
      <AdminSectionHeader
        icon={FlaskConical}
        breadcrumbLabel={t("pageTitle")}
        subtitle={t("pageSubtitle")}
      />
      <TestsDashboard health={health} vitestReport={vitestReport} />
    </div>
  );
}
