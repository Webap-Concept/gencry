/**
 * JsonLdScript — Server Component.
 *
 * Legge il pathname dalla request (header x-pathname impostato dal middleware),
 * recupera la configurazione SEO della pagina dal DB (cached 60s),
 * e inietta uno <script type="application/ld+json"> nell'<head> se abilitato.
 *
 * Per Article/BlogPosting emette i campi richiesti da Google per la
 * validation Rich Results (image, datePublished, dateModified, author,
 * publisher con logo). Senza questi il Rich Results Test dà errore
 * "Missing field". `datePublished` viene pescato dalla pages.published_at
 * (lookup separato cached) per i CMS articoli; fallback a updatedAt
 * per le pagine che non hanno un page CMS associato.
 *
 * Niente JSON-LD se:
 * - jsonLdEnabled è false
 * - jsonLdType è null/undefined
 * - la pagina non ha una riga nella tabella seo_pages
 */

import { getAdminUrlSlug } from "@/lib/admin-paths";
import { db } from "@/lib/db/drizzle";
import { pages } from "@/lib/db/schema";
import { getSeoPage } from "@/lib/db/seo-queries";
import { getAppSettings } from "@/lib/db/settings-queries";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { unstable_cache } from "next/cache";

// JSON-LD è best-effort: un blip transitorio del pooler Supabase
// (EAUTHTIMEOUT / 08006 — timeout in fase di auth della connessione) non
// deve propagare né far loggare la revalidation della cache. Il try/catch
// sta DENTRO la funzione cached così la inner fn non lancia mai: né in
// foreground né nella revalidation in background (che è quella che
// stampava "revalidating cache with key … Error" nei log Vercel). Su
// errore cade su null/undefined → niente JSON-LD per ≤60s, poi la prossima
// revalidation che va a buon fine ri-popola.
const getCachedSeoPage = unstable_cache(
  async (pathname: string) => {
    try {
      return await getSeoPage(pathname);
    } catch {
      return null;
    }
  },
  ["json-ld-seo-page"],
  { revalidate: 60, tags: ["seo"] },
);

const getCachedSettings = unstable_cache(
  async () => {
    try {
      return await getAppSettings();
    } catch {
      return null;
    }
  },
  ["json-ld-settings"],
  { revalidate: 60, tags: ["settings"] },
);

/**
 * Lookup published_at della page CMS dato il pathname. Ritorna null se
 * non esiste una page published con quello slug — i caller (es. system
 * pages, route handler) cadono su seo_page.updatedAt come fallback.
 */
const getPagePublishedAt = unstable_cache(
  async (slug: string): Promise<Date | null> => {
    try {
      const [row] = await db
        .select({ publishedAt: pages.publishedAt })
        .from(pages)
        .where(and(eq(pages.slug, slug), eq(pages.status, "published")))
        .limit(1);
      return row?.publishedAt ?? null;
    } catch {
      // Vedi nota su getCachedSeoPage: best-effort, niente throw nella cache.
      return null;
    }
  },
  ["json-ld-page-published-at"],
  { revalidate: 60, tags: ["pages"] },
);

/** Identica alla funzione in lib/seo.ts — replicata per evitare import cross-layer. */
function resolvePlaceholders(text: string, appName: string): string {
  if (!text || !appName) return text;
  return text.replace(/\{\{appName\}\}/gi, appName);
}

/**
 * Coerce a Date|string|null|undefined into ISO 8601 or undefined.
 * Necessario perché `unstable_cache` serializza in JSON e i campi Date
 * tornano come stringhe ISO al deserialize — chiamare `.toISOString()`
 * direttamente fa crashare il render con "c.toISOString is not a
 * function" sulle pagine che hanno JSON-LD abilitato (vedi bug
 * 2026-05-20: tutte le pagine articolo crashavano dopo questo refactor).
 */
function toIsoSafe(value: Date | string | null | undefined): string | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value.toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

export async function JsonLdScript() {
  const headersList = await headers();
  const pathname = headersList.get("x-pathname") ?? "/";

  // Non iniettare JSON-LD nelle route admin o api
  const adminSlug = await getAdminUrlSlug();
  const adminBase = `/${adminSlug}`;
  if (
    pathname === adminBase ||
    pathname.startsWith(`${adminBase}/`) ||
    pathname.startsWith("/api")
  ) {
    return null;
  }

  const [page, settings] = await Promise.all([
    getCachedSeoPage(pathname),
    getCachedSettings(),
  ]);

  // !settings → un blip DB ha fatto fallire la fetch settings: niente
  // JSON-LD (best-effort), invece di crashare su settings.app_name.
  if (!page?.jsonLdEnabled || !page?.jsonLdType || !settings) return null;

  const appName = settings.app_name?.trim() || "App";
  let domain = settings.app_domain?.trim() ?? "";
  if (domain && !/^https?:\/\//i.test(domain)) domain = `https://${domain}`;
  domain = domain.replace(/\/$/, "");

  const siteUrl = domain ? `${domain}${pathname}` : undefined;

  // Risolve i placeholder {{appName}} in tutti i campi testuali
  const resolve = (text?: string | null) =>
    text ? resolvePlaceholders(text, appName) : undefined;

  const name = resolve(page.title) || appName;
  const description = resolve(page.description);

  // OG image cascade: priorità seo_pages.og_image > global default
  // (app_og_image_url). Usato come `image` per Article/BlogPosting che
  // lo richiedono obbligatoriamente.
  const image = page.ogImage ?? settings.app_og_image_url ?? undefined;

  // Costruisce il base object JSON-LD con i campi disponibili nel DB
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": page.jsonLdType,
    name,
    ...(description ? { description } : {}),
    ...(siteUrl ? { url: siteUrl } : {}),
    ...(image ? { image } : {}),
  };

  // Campi aggiuntivi specifici per tipo.
  //
  // Article/BlogPosting: Google richiede image + datePublished +
  // dateModified + author + publisher.logo per validare il rich result.
  // Senza questi campi il Rich Results Test dà errore "Missing field"
  // e l'articolo non guadagna l'enhanced SERP card.
  if (page.jsonLdType === "Article" || page.jsonLdType === "BlogPosting") {
    jsonLd.headline = name;
    // Strip "/" leading per fare match con pages.slug ("/news/foo" → "news/foo")
    const slug = pathname.replace(/^\/+/, "");
    const publishedAt = slug ? await getPagePublishedAt(slug) : null;
    const datePublished = toIsoSafe(publishedAt);
    if (datePublished) {
      jsonLd.datePublished = datePublished;
    }
    const dateModified = toIsoSafe(page.updatedAt);
    if (dateModified) {
      jsonLd.dateModified = dateModified;
    }
    // author come Organization (l'app stessa). Quando avremo un sistema
    // di autori reali per le news, passeremo a Person + name reale.
    jsonLd.author = {
      "@type": "Organization",
      name: appName,
      ...(domain ? { url: domain } : {}),
    };
    // publisher con logo: Google preferisce un'ImageObject (non solo
    // url stringa). Usiamo app_logo_url se configurato.
    jsonLd.publisher = {
      "@type": "Organization",
      name: appName,
      ...(domain ? { url: domain } : {}),
      ...(settings.app_logo_url
        ? {
            logo: {
              "@type": "ImageObject",
              url: settings.app_logo_url,
            },
          }
        : {}),
    };
  }

  if (page.jsonLdType === "Organization" || page.jsonLdType === "LocalBusiness") {
    jsonLd.url = domain || siteUrl || "";
    if (settings.app_logo_url) {
      jsonLd.logo = settings.app_logo_url;
    }
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}
