// app/(admin)/admin/logs/page.tsx
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
      <div className="flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{
            background:
              "color-mix(in srgb, var(--admin-accent) 12%, var(--admin-card-bg))",
            border:
              "1px solid color-mix(in srgb, var(--admin-accent) 25%, transparent)",
          }}>
          <ClipboardList size={18} style={{ color: "var(--admin-accent)" }} />
        </div>
        <div>
          <h2
            className="text-lg font-bold"
            style={{ color: "var(--admin-text)" }}>
            {t("pageTitle")}
          </h2>
          <p
            className="text-sm mt-0.5"
            style={{ color: "var(--admin-text-faint)" }}>
            {t("pageSubtitle")}
          </p>
        </div>
      </div>

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
