import { CmsFigureLightbox } from "@/app/(frontend)/_render/cms-figure-lightbox";
import { getDynamicTemplate } from "@/app/(frontend)/_templates/loader";
import { resolveMediaFields } from "@/app/(frontend)/_templates/resolve-media-fields";
import { parseCustomFields } from "@/app/(frontend)/_templates/types";
import { getCmsStylesVersion } from "@/lib/cms/styles-version";
import { getPageWithTemplate } from "@/lib/db/pages-queries";
import { getCachedSeoPage } from "@/lib/seo";
import { getAppSettingsSafe } from "@/lib/db/settings-queries";
import { DEFAULT_LOCALE, LOCALES, type Locale } from "@/lib/i18n/config";
import { resolvePlaceholders } from "@/lib/utils/content-placeholders";
import { sanitizeRichTextHtml } from "@/lib/utils/sanitize-html";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

// CSS dei contenuti CMS (.tpl-content, .cms-figure, blockquote 4 stili).
// Servito da /api/cms/styles.css come <link> server-rendered: il file
// viene incluso solo sulle pagine CMS effettive (non nel layout (frontend)
// che ospita anche footer cookie / 404 / landing). La sorgente è
// app_settings[cms.custom_css] con fallback al default seed
// in lib/cms/default-styles.ts. L'admin lo edita da /admin/content/styles.

/**
 * Se il primo segmento dello slug è un locale conosciuto, lo strippa e
 * lo ritorna a parte. Esempio:
 *   ["en", "company"] → { locale: "en", segments: ["company"] }
 *   ["azienda"]       → { locale: DEFAULT_LOCALE, segments: ["azienda"] }
 *
 * Il proxy redirige `/<DEFAULT_LOCALE>/<rest>` a `/<rest>` (308), quindi
 * in pratica qui vediamo solo locale ≠ default. Manteniamo comunque il
 * check generico così l'helper resta corretto se il flusso cambia.
 */
function detectLocaleFromSlug(slug: string[]): {
  locale: Locale;
  segments: string[];
} {
  const first = slug[0];
  if (first && (LOCALES as readonly string[]).includes(first)) {
    return { locale: first as Locale, segments: slug.slice(1) };
  }
  return { locale: DEFAULT_LOCALE, segments: slug };
}

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
  locale: explicitLocale,
}: {
  slug: string[];
  locale?: Locale;
}): Promise<Metadata> {
  const resolved = explicitLocale
    ? { locale: explicitLocale, segments: slug }
    : detectLocaleFromSlug(slug);
  const { locale, segments } = resolved;
  const pageSlug = segments.join("/");

  const [page, settings] = await Promise.all([
    getPageWithTemplate(pageSlug, locale),
    getAppSettingsSafe(),
  ]);

  // SEO config è chiavata sul pathname canonico (default-locale).
  // Se la pagina è stata trovata, usiamo `page.slug` (sempre nel default
  // locale). Altrimenti fallback al pathname richiesto per il lookup 404.
  // Passiamo `locale` a getCachedSeoPage: per locale non-default applica
  // l'overlay da seo_page_translations sui 4 campi testuali.
  const seoPathname = page ? `/${page.slug}` : "/" + segments.join("/");
  // Cached + graceful: 60s TTL keyed on (pathname, locale). Invalidated
  // by the same revalidateTag("seo") that the admin actions already
  // call on save. Hot path on every public CMS render — without this
  // cache, each page render = 1 DB hit on seo_pages.
  const seo = await getCachedSeoPage(seoPathname, locale);

  const resolve = (text?: string | null) =>
    text ? resolvePlaceholders(text, settings) : undefined;

  const isMissing = !page || page.status !== "published";
  const isMetaOnlySystemPage =
    page?.isSystem === true && page?.contentEditable === false;

  if (!seo && (isMissing || isMetaOnlySystemPage)) {
    // The /404 SEO record is hot under any traffic burst (every 404
    // hits this path). We use the cached + try/catch-graceful wrapper
    // from lib/seo so:
    //   - 60s in-memory cache absorbs the burst → 1 DB hit / minute
    //     instead of 1 / 404, killing the statement_timeout reports
    //     Sentry was logging;
    //   - if the DB still fails for any reason, the wrapper returns
    //     undefined and we fall back to the hardcoded title/description
    //     below — the 404 page renders no matter what.
    const fallback = await getCachedSeoPage("/404");
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

export async function CmsPage({
  slug,
  locale: explicitLocale,
}: {
  slug: string[];
  /**
   * Locale già risolto dal caller (es. da `app/[locale]/[...slug]/page.tsx`,
   * dove il prefix locale è catturato dal segment param e quindi NON
   * compare in `slug`). Se non passato, si tenta di detectarlo dal
   * primo segmento dello slug — utile per `(frontend)/[...slug]/page.tsx`
   * quando Next.js matcha multi-segment senza route group locale.
   */
  locale?: Locale;
}) {
  const resolved = explicitLocale
    ? { locale: explicitLocale, segments: slug }
    : detectLocaleFromSlug(slug);
  const { locale, segments } = resolved;
  const pageSlug = segments.join("/");
  if (!pageSlug) {
    console.warn("[cms-page] notFound: empty slug", { rawSlug: slug, locale });
    notFound();
  }
  const [pageData, settings, stylesVersion] = await Promise.all([
    getPageWithTemplate(pageSlug, locale),
    getAppSettingsSafe(),
    getCmsStylesVersion(),
  ]);

  if (!pageData) {
    // Diagnostica: vediamo nel log Vercel ESATTAMENTE cosa il routing
    // ha richiesto. Se il path è chiaramente esistente ma il record non
    // viene trovato, controlliamo encoding, trailing slash, case del
    // valore in DB. Senza questo log dovevamo indovinare.
    console.warn("[cms-page] notFound: no page row", { pageSlug, locale });
    notFound();
  }
  if (pageData.status !== "published") {
    console.warn("[cms-page] notFound: page not published", {
      pageSlug,
      locale,
      status: pageData.status,
    });
    notFound();
  }

  // Le system pages "meta-only" (contentEditable=false) sono container
  // amministrativi: l'admin gestisce solo titolo + meta SEO, e le rotte
  // vere sono servite da page handler dedicati (es. /sign-in →
  // (login)/sign-in/page.tsx). Non devono essere navigabili come URL CMS.
  if (pageData.isSystem && !pageData.contentEditable) {
    console.warn("[cms-page] notFound: system meta-only page", {
      pageSlug,
      locale,
      systemKey: pageData.systemKey,
    });
    notFound();
  }

  const templateSlug = pageData.template?.slug ?? null;
  const TemplateComponent = getDynamicTemplate(templateSlug);
  const rawFields = parseCustomFields(pageData.customFields);
  const fields = await resolveMediaFields(
    rawFields,
    pageData.template?.fields ?? [],
  );

  const resolvedContent = resolvePlaceholders(pageData.content, settings);
  const safePage = {
    ...pageData,
    content: sanitizeRichTextHtml(resolvedContent),
  };

  return (
    <>
      {/* Stylesheet CMS — servito da app/api/cms/styles.css/route.ts.
          Usa precedence per essere hoistato nell'<head> dal Float di
          Next 16 (app router → ReactDOM resource hoisting).

          `?v=<stylesVersion>` è un cache buster: il valore = updated_at
          della key cms.custom_css. Quando l'admin salva, il timestamp
          cambia → URL diverso → browser/CDN fanno cache miss e
          fetch-ano la nuova versione subito (senza aspettare i 5 min di
          max-age). Vedi lib/cms/styles-version.ts. */}
      <link
        rel="stylesheet"
        href={`/api/cms/styles.css?v=${stylesVersion}`}
        precedence="default"
      />
      <TemplateComponent
        page={safePage}
        template={pageData.template ?? null}
        fields={fields}
      />
      {/* Lightbox client per le `figure[data-zoom="true"]` nel content
          rich-text. Singola istanza per pagina; scanna il DOM al mount
          e ignora pagine senza figure zoomable (early return). */}
      <CmsFigureLightbox />
    </>
  );
}
