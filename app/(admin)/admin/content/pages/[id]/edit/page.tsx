import { AdminSectionHeader } from "@/app/(admin)/admin/_components/section-header";
import { getAllPageTemplateExtensions } from "@/lib/cms/page-template-extensions";
import {
  getAllPages,
  getEnabledLocales,
  getPageById,
  getPageTranslationsForPage,
} from "@/lib/db/pages-queries";
import { getUser } from "@/lib/db/queries";
import { isSystemSlugEditable } from "@/lib/db/schema";
import { getSeoPage, getSeoPageTranslations } from "@/lib/db/seo-queries";
import { getAppSettings } from "@/lib/db/settings-queries";
import { getAllTemplates, getTemplateById } from "@/lib/db/template-queries";
// Side-effect: popola il registry delle PageTemplateExtension via i moduli installati.
import "@/lib/modules/registry";
import { can } from "@/lib/rbac/can";
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

  const [page, pages, templates, settings, locales, user] = await Promise.all([
    getPageById(pageId),
    getAllPages(),
    getAllTemplates(),
    getAppSettings(),
    getEnabledLocales(),
    getUser(),
  ]);

  if (!page) notFound();

  const canManageTemplates = user
    ? user.isAdmin || (await can(user, "content:templates"))
    : false;

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

  // --- Template rules della page corrente (slugLocked + contentLocked) ---
  let templateSlugLocked = false;
  let templateContentLocked = false;
  if (page.templateId) {
    const pageTemplate = await getTemplateById(page.templateId);
    if (pageTemplate) {
      const { parseTemplateRules } = await import("@/lib/cms/template-rules");
      const rules = parseTemplateRules(pageTemplate.rules);
      templateSlugLocked = rules.slugLocked === true;
      templateContentLocked = rules.contentLocked === true;
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
        // contentLocked dal template ha priorità su contentEditable per-page:
        // se il template dice "no body", l'editor nasconde sempre il tab
        // Contenuto, anche se la singola page avrebbe contentEditable=true.
        contentEditable={
          templateContentLocked ? false : (page.contentEditable ?? true)
        }
        // slugLocked dal template applica come secondo motivo di lock,
        // oltre al lock system-page già esistente.
        slugEditable={
          isSystemSlugEditable({
            isSystem: page.isSystem ?? false,
            systemKey: page.systemKey ?? null,
          }) && !templateSlugLocked
        }
        locales={locales}
        initialTranslations={translations}
        initialSeoTranslations={seoTranslations}
        canManageTemplates={canManageTemplates}
        moduleExtensions={getAllPageTemplateExtensions()}
      />
    </div>
  );
}
