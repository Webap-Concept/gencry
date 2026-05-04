import { AdminSectionInfo } from "@/app/(admin)/admin/_components/section-info";
import { getAllPages } from "@/lib/db/pages-queries";
import { getAppSettings } from "@/lib/db/settings-queries";
import { getAllTemplates } from "@/lib/db/template-queries";
import { FileText } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import PageManager from "./_components/page-manager";
import { PagesAdminGuide } from "./_components/pages-admin-guide";

export const metadata: Metadata = { title: "Content / Pages" };
export const dynamic = "force-dynamic";

async function ContentContent() {
  const [pages, templates, settings] = await Promise.all([
    getAllPages(),
    getAllTemplates(),
    getAppSettings(),
  ]);

  let appDomain = settings.app_domain ?? "";
  if (appDomain && !appDomain.startsWith("http")) {
    appDomain = `https://${appDomain}`;
  }
  appDomain = appDomain.replace(/\/+$/, "");

  return (
    <PageManager
      initialPages={pages}
      templates={templates}
      appDomain={appDomain}
    />
  );
}

export default function ContentPage() {
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <div
          className="w-9 h-9 shrink-0 rounded-xl flex items-center justify-center"
          style={{
            background:
              "color-mix(in srgb, var(--admin-accent) 12%, var(--admin-card-bg))",
            border:
              "1px solid color-mix(in srgb, var(--admin-accent) 25%, transparent)",
          }}>
          <FileText size={18} style={{ color: "var(--admin-accent)" }} />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2
              className="text-lg font-bold"
              style={{ color: "var(--admin-text)" }}>
              <span style={{ color: "var(--admin-text-muted)" }}>Content</span>
              <span style={{ color: "var(--admin-text-faint)" }}> / </span>
              <span>Pages</span>
            </h2>
            <AdminSectionInfo
              title="Pages — operator's guide"
              ariaLabel="Show pages guide">
              <PagesAdminGuide />
            </AdminSectionInfo>
          </div>
          <p
            className="text-sm mt-0.5"
            style={{ color: "var(--admin-text-faint)" }}>
            Manage the static content of the App
          </p>
        </div>
      </div>

      <div
        className="rounded-xl shadow-sm p-5"
        style={{
          background: "var(--admin-card-bg)",
          border: "1px solid var(--admin-card-border)",
        }}>
        <Suspense
          fallback={
            <div className="flex items-center justify-center h-32">
              <div
                className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
                style={{
                  borderColor: "var(--admin-accent)",
                  borderTopColor: "transparent",
                }}
              />
            </div>
          }>
          <ContentContent />
        </Suspense>
      </div>
    </div>
  );
}
