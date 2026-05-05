import { getDynamicTemplate } from "@/app/(frontend)/_templates/loader";
import { parseCustomFields } from "@/app/(frontend)/_templates/types";
import { getPageWithTemplate } from "@/lib/db/pages-queries";
import { getSeoPage } from "@/lib/db/seo-queries";
import { getAppSettings } from "@/lib/db/settings-queries";
import { isLocale } from "@/lib/i18n/config";
import { resolvePlaceholders } from "@/lib/utils/content-placeholders";
import { sanitizeRichTextHtml } from "@/lib/utils/sanitize-html";
import { setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

/**
 * Mirror del CMS catch-all `(frontend)/[...slug]/page.tsx` per le rotte
 * con prefix locale (es. `/en/about`).
 *
 * In PR-1b la query `getPageWithTemplate(slug)` non è ancora locale-aware:
 * la pagina è ricavata dal DB nel locale di default e renderizzata.
 * Questo è backward-compat: l'URL prefix funziona ma il contenuto è
 * uguale alla versione default. La localizzazione vera dei contenuti CMS
 * arriverà in PR-2 (schema `page_translations`) e PR-4 (popolamento +
 * lookup join).
 *
 * Il proxy.ts step [0] caso 1 garantisce che `/<default>/<slug>` non
 * arrivi mai qui — viene rediretto a `/<slug>` che è gestita dal
 * page handler `(frontend)/[...slug]`. Quindi questo handler è invocato
 * SOLO per locale ≠ default.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string[] }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return {};

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

export default async function LocaleFrontendPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string[] }>;
}) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const pageSlug = slug.join("/");
  const [pageData, settings] = await Promise.all([
    getPageWithTemplate(pageSlug),
    getAppSettings(),
  ]);

  if (!pageData || pageData.status !== "published") {
    notFound();
  }

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
