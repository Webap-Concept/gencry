import { AdminSectionHeader } from "@/app/(admin)/admin/_components/section-header";
import {
  getAllPages,
  getEnabledLocales,
  getPageById,
  getPageTranslationsForPage,
} from "@/lib/db/pages-queries";
import { isSystemSlugEditable } from "@/lib/db/schema";
import { getSeoPage, getSeoPageTranslations } from "@/lib/db/seo-queries";
import { getAppSettings } from "@/lib/db/settings-queries";
import { getAllTemplates, getTemplateById } from "@/lib/db/template-queries";
import { FileText } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import PageEditor from "../../_components/page-editor-loader";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.content.pages");
  return { title: t("metaTitleEdit") };
}

/** Legge allowedChildTemplateIds dal JSON `rules` del template padre */
function getAllowedChildTemplateIds(
  rules: string | null | undefined,
): number[] {
  try {
    const parsed = JSON.parse(rules ?? "{}");
    const raw = parsed?.allowedChildTemplateIds;
    if (!Array.isArray(raw)) return [];
    return raw.map(Number).filter((n) => !isNaN(n));
  } catch {
    return [];
  }
}

export default async function EditPagePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const pageId = Number(id);
  if (isNaN(pageId)) notFound();

  const [page, pages, templates, settings, locales] = await Promise.all([
    getPageById(pageId),
    getAllPages(),
    getAllTemplates(),
    getAppSettings(),
    getEnabledLocales(),
  ]);

  if (!page) notFound();

  const [seo, translations, seoTranslations] = await Promise.all([
    getSeoPage(`/${page.slug}`),
    getPageTranslationsForPage(pageId),
    getSeoPageTranslations(`/${page.slug}`),
  ]);

  // --- Calcola templateLocked server-side ---
  let templateLocked = false;
  if (page.parentId) {
    const parentPage = pages.find((p) => p.id === page.parentId);
    if (parentPage?.templateId) {
      const parentTemplate = await getTemplateById(parentPage.templateId);
      if (parentTemplate) {
        const allowed = getAllowedChildTemplateIds(parentTemplate.rules);
        if (allowed.length === 1) {
          templateLocked = true;
        }
      }
    }
  }

  const t = await getTranslations("admin.content.pages");

  return (
    <div className="max-w-4xl">
      <AdminSectionHeader
        icon={FileText}
        breadcrumbLabel={t("breadcrumbContent")}
        title={t("pageTitle")}
      />
      <PageEditor
        page={page}
        seo={seo}
        pages={pages.filter((p) => p.id !== page.id)}
        templates={templates}
        domain={settings?.app_domain ?? ""}
        appName={settings?.app_name ?? ""}
        templateLocked={templateLocked}
        isSystem={page.isSystem ?? false}
        pageType={page.pageType ?? "page"}
        contentEditable={page.contentEditable ?? true}
        slugEditable={isSystemSlugEditable({
          isSystem: page.isSystem ?? false,
          systemKey: page.systemKey ?? null,
        })}
        locales={locales}
        initialTranslations={translations}
        initialSeoTranslations={seoTranslations}
      />
    </div>
  );
}
