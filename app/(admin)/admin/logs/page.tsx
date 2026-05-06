// app/(admin)/admin/logs/page.tsx
import { AdminSectionHeader } from "@/app/(admin)/admin/_components/section-header";
import { getActivityLogs } from "@/lib/db/admin-queries";
import { requireAdminPage } from "@/lib/rbac/guards";
import { ClipboardList } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { LogsClient } from "./_components/logs-client";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.logs");
  return { title: t("metaTitle") };
}

async function LogsContent({ page, tab }: { page: number; tab: string }) {
  const data = await getActivityLogs({ page, perPage: 20, tab });
  return <LogsClient data={data} />;
}

export default async function AdminLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; tab?: string }>;
}) {
  await requireAdminPage();
  const t = await getTranslations("admin.logs");

  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1));
  const tab = params.tab ?? "rbac";

  return (
    <div className="space-y-5">
      <AdminSectionHeader
        icon={ClipboardList}
        breadcrumbLabel={t("pageTitle")}
        subtitle={t("pageSubtitle")}
      />

      <Suspense
        key={`${tab}-${page}`}
        fallback={
          <div className="flex items-center justify-center h-40">
            <div
              className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
              style={{
                borderColor: "var(--admin-accent)",
                borderTopColor: "transparent",
              }}
            />
          </div>
        }>
        <LogsContent page={page} tab={tab} />
      </Suspense>
    </div>
  );
}
