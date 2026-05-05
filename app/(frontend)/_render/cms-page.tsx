import { getDynamicTemplate } from "@/app/(frontend)/_templates/loader";
import { parseCustomFields } from "@/app/(frontend)/_templates/types";
import { getPageWithTemplate } from "@/lib/db/pages-queries";
import { getSeoPage } from "@/lib/db/seo-queries";
import { getAppSettings } from "@/lib/db/settings-queries";
import { resolvePlaceholders } from "@/lib/utils/content-placeholders";
import { sanitizeRichTextHtml } from "@/lib/utils/sanitize-html";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

/**
 * Helper condivisi per il rendering delle pagine CMS dal DB.
 *
 * Sono usati da:
 *   - app/(frontend)/[...slug]/page.tsx       → URL senza prefix locale
 *   - app/[locale]/[...slug]/page.tsx         → URL con prefix locale valido
 *   - app/[locale]/page.tsx (fallback)        → URL "/<slug>" che Next.js
 *     matcha come [locale]/page.tsx perché il primo segmento è dinamico:
 *     se il segmento NON è un locale conosciuto, va trattato come slug CMS
 *   - app/[locale]/[...slug]/page.tsx (fallback) → idem ma multi-segmento
 *
 * Rendendo questi tre handler tutti delegati a un singolo helper,
 * evitiamo che `/privacy` (1 segmento) o `/blog/post-1` (2+ segmenti)
 * vengano persi dal routing nel Modello E i18n.
 */

export async function cmsPageMetadata({
  slug,
}: {
  slug: string[];
}): Promise<Metadata> {
  const pathname = "/" + slug.join("/");

  const [seo, page, settings] = await Promise.all([
    getSeoPage(pathname),
    getPageWithTemplate(slug.join("/")),
    getAppSettings(),
  ]);

  const resolve = (text?: string | null) =>
    text ? resolvePlaceholders(text, settings) : undefined;

  const isMissing = !page || page.status !== "published";
  const isMetaOnlySystemPage =
    page?.isSystem === true && page?.contentEditable === false;

  if (!seo && (isMissing || isMetaOnlySystemPage)) {
    const fallback = await getSeoPage("/404");
    return {
      title: resolve(fallback?.title) ?? "404 — Pagina non trovata",
      description:
        resolve(fallback?.description) ??
        "L'asset che cercavi non è in portafoglio.",
      openGraph: {
        title: resolve(fallback?.ogTitle) ?? resolve(fallback?.title),
        description:
          resolve(fallback?.ogDescription) ?? resolve(fallback?.description),
        ...(fallback?.ogImage ? { images: [{ url: fallback.ogImage }] } : {}),
      },
      robots: fallback?.robots ?? "noindex, follow",
    };
  }

  const title = resolve(seo?.title) ?? page?.title ?? undefined;
  const description = resolve(seo?.description);

  return {
    title,
    description,
    openGraph: {
      title: resolve(seo?.ogTitle) ?? title,
      description: resolve(seo?.ogDescription) ?? description,
      ...(seo?.ogImage ? { images: [{ url: seo.ogImage }] } : {}),
    },
    robots: seo?.robots || undefined,
  };
}

export async function CmsPage({ slug }: { slug: string[] }) {
  const pageSlug = slug.join("/");
  const [pageData, settings] = await Promise.all([
    getPageWithTemplate(pageSlug),
    getAppSettings(),
  ]);

  if (!pageData || pageData.status !== "published") {
    notFound();
  }

  // Le system pages "meta-only" (contentEditable=false) sono container
  // amministrativi: l'admin gestisce solo titolo + meta SEO, e le rotte
  // vere sono servite da page handler dedicati (es. /sign-in →
  // (login)/sign-in/page.tsx). Non devono essere navigabili come URL CMS.
  if (pageData.isSystem && !pageData.contentEditable) {
    notFound();
  }

  const templateSlug = pageData.template?.slug ?? null;
  const TemplateComponent = getDynamicTemplate(templateSlug);
  const fields = parseCustomFields(pageData.customFields);

  const resolvedContent = resolvePlaceholders(pageData.content, settings);
  const safePage = {
    ...pageData,
    content: sanitizeRichTextHtml(resolvedContent),
  };

  return (
    <TemplateComponent
      page={safePage}
      template={pageData.template ?? null}
      fields={fields}
    />
  );
}
