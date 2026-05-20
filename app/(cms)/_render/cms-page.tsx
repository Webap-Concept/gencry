import { CmsFigureLightbox } from "@/app/(cms)/_render/cms-figure-lightbox";
import { getDynamicTemplate } from "@/app/(cms)/_templates/loader";
import { resolveMediaFields } from "@/app/(cms)/_templates/resolve-media-fields";
import { parseCustomFields } from "@/app/(cms)/_templates/types";
import { getCmsStylesVersion } from "@/lib/cms/styles-version";
import { getAssetById } from "@/lib/db/media-queries";
import { getCachedPageWithTemplate } from "@/lib/db/pages-queries";
import { getCachedSeoPage } from "@/lib/seo";
import { getAppSettingsSafe } from "@/lib/db/settings-queries";
import { pickMediaVariantUrl } from "@/lib/storage/media-asset-processor";
import { DEFAULT_LOCALE, LOCALES, type Locale } from "@/lib/i18n/config";
import { resolvePlaceholders } from "@/lib/utils/content-placeholders";
import { sanitizeRichTextHtml } from "@/lib/utils/sanitize-html";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

// CSS dei contenuti CMS (.tpl-content, .cms-figure, blockquote 4 stili).
// Servito da /api/cms/styles.css come <link> server-rendered: il file
// viene incluso solo sulle pagine CMS effettive (non nel layout (cms)
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
 * Slug prefixes che NON sono pagine CMS e devono fallire fast con 404
 * senza toccare il DB. Tipico esempio: `_vercel/insights/script.js`
 * iniettato da @vercel/analytics che in dev locale non esiste come
 * asset → arriva al catch-all → rumore nei log + occasionale crash
 * `transformAlgorithm` di Next 16 sullo stream della not-found page.
 *
 * I path Next-reserved iniziano sempre con underscore (`_next/`,
 * `_vercel/`, ecc.) — Next li serve internamente dal proprio runtime
 * o dal /public. Se finiscono qui significa che non sono stati
 * trovati: notFound() pulito invece di logica DB-bound.
 */
function isReservedPathPrefix(pageSlug: string): boolean {
  return pageSlug.startsWith("_");
}

/**
 * Helper condivisi per il rendering delle pagine CMS dal DB.
 *
 * Sono usati da:
 *   - app/[locale]/page.tsx              → URL "/<slug>" (single-segment).
 *     Next matcha sempre prima `[locale]/page.tsx` perché [locale] è
 *     un dynamic param standard: se il segmento NON è un locale
 *     conosciuto, va trattato come slug CMS (fallback).
 *   - app/[locale]/[...slug]/page.tsx    → URL multi-segmento. Stesso
 *     pattern: prefix locale valido oppure fallback con primo segmento
 *     parte dello slug.
 *
 * (Esisteva anche `app/(cms)/[...slug]/page.tsx` come catch-all senza
 * prefix locale — rimosso come dead code: i dynamic param `[locale]`
 * vincono sempre sui catch-all `[...slug]` nella route resolution di
 * Next.js, quindi quella entry non era mai invocata.)
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

  // Reserved framework/asset prefixes never map to CMS pages. Bail out
  // before touching the DB — avoids log noise from probe requests like
  // `_vercel/insights/script.js` (auto-injected by @vercel/analytics)
  // and the "transformAlgorithm is not a function" stream crash that
  // Next 16 produces when notFound() bubbles through a missing asset.
  if (isReservedPathPrefix(pageSlug)) {
    notFound();
  }

  const [page, settings] = await Promise.all([
    getCachedPageWithTemplate(pageSlug, locale),
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

  // OG image cascade per pagine CMS:
  //   1. seo.ogImage              → admin override esplicito su /admin/seo
  //   2. primo template field image con valore in customFields → variante hero
  //      (scan agnostico al nome del field: funziona per news, future guide,
  //      qualunque template con un campo image)
  //   3. app_og_image_url         → global fallback (vedi /settings/general)
  //
  // Niente og:image alla fine = niente <meta og:image> (mai mostriamo
  // placeholder fake), il client cade sulla card fallback social.
  let ogImageFromTemplate: string | undefined;
  if (!seo?.ogImage && page?.template?.fields && page.customFields) {
    try {
      const customFields = JSON.parse(page.customFields) as Record<string, string>;
      const imageField = page.template.fields
        .filter((f) => f.fieldType === "image")
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .find((f) => customFields[f.fieldKey]?.trim());
      if (imageField) {
        const assetId = Number(customFields[imageField.fieldKey]);
        if (Number.isInteger(assetId) && assetId > 0) {
          const asset = await getAssetById(assetId);
          if (asset) {
            ogImageFromTemplate = pickMediaVariantUrl(
              asset.variants,
              asset.publicUrl,
              "hero",
            );
          }
        }
      }
    } catch {
      // customFields malformato → skip silenziosamente, cascade prosegue
    }
  }

  const ogImage =
    seo?.ogImage ?? ogImageFromTemplate ?? settings.app_og_image_url ?? undefined;

  return {
    title,
    description,
    openGraph: {
      title: resolve(seo?.ogTitle) ?? title,
      description: resolve(seo?.ogDescription) ?? description,
      ...(ogImage ? { images: [{ url: ogImage }] } : {}),
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
   * primo segmento dello slug — utile quando il caller non sa già
   * se quel segmento è un locale o parte dello slug CMS.
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
  if (isReservedPathPrefix(pageSlug)) {
    // See note in generateCmsPageMetadata — same reasoning applies on render.
    notFound();
  }
  const [pageData, settings, stylesVersion] = await Promise.all([
    getCachedPageWithTemplate(pageSlug, locale),
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
