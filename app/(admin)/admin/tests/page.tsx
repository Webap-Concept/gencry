// app/(admin)/admin/tests/page.tsx
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { requireAdminPage } from "@/lib/rbac/guards";
import { TestsDashboard } from "./_components/tests-dashboard";
import { getHealthChecks, getVitestReport } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.tests");
  return { title: t("metaTitle") };
}

export default async function AdminTestsPage() {
  await requireAdminPage();
  const [health, vitestReport] = await Promise.all([
    getHealthChecks(),
    getVitestReport(),
  ]);
  return <TestsDashboard health={health} vitestReport={vitestReport} />;
}
