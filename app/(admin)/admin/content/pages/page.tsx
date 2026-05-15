import { getAllPages } from "@/lib/db/pages-queries";
import { getAppSettings } from "@/lib/db/settings-queries";
import { getAllTemplates } from "@/lib/db/template-queries";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import PageManager from "./_components/page-manager";
import { buildPageThumbnails } from "./_lib/page-thumbnails";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.content.pages");
  return { title: t("metaTitle") };
}
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

  const pageThumbnails = await buildPageThumbnails(pages, templates);

  return (
    <PageManager
      initialPages={pages}
      templates={templates}
      appDomain={appDomain}
      pageThumbnails={pageThumbnails}
    />
  );
}

export default async function ContentPage() {
  return (
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
  );
}
