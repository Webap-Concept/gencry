/**
 * JsonLdScript — Server Component.
 *
 * Legge il pathname dalla request (header x-pathname impostato dal middleware),
 * recupera la configurazione SEO della pagina dal DB (cached 60s),
 * e inietta uno <script type="application/ld+json"> nell'<head> se abilitato.
 *
 * Non renderizza nulla se:
 * - jsonLdEnabled è false
 * - jsonLdType è null/undefined
 * - la pagina non ha una riga nella tabella seo_pages
 */

import { getAdminUrlSlug } from "@/lib/admin-paths";
import { getSeoPage } from "@/lib/db/seo-queries";
import { getAppSettings } from "@/lib/db/settings-queries";
import { headers } from "next/headers";
import { unstable_cache } from "next/cache";

const getCachedSeoPage = unstable_cache(
  (pathname: string) => getSeoPage(pathname),
  ["json-ld-seo-page"],
  { revalidate: 60, tags: ["seo"] },
);

const getCachedSettings = unstable_cache(
  () => getAppSettings(),
  ["json-ld-settings"],
  { revalidate: 60, tags: ["settings"] },
);

/** Identica alla funzione in lib/seo.ts — replicata per evitare import cross-layer. */
function resolvePlaceholders(text: string, appName: string): string {
  if (!text || !appName) return text;
  return text.replace(/\{\{appName\}\}/gi, appName);
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

  if (!page?.jsonLdEnabled || !page?.jsonLdType) return null;

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

  // Costruisce il base object JSON-LD con i campi disponibili nel DB
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": page.jsonLdType,
    name,
    ...(description ? { description } : {}),
    ...(siteUrl ? { url: siteUrl } : {}),
    ...(page.ogImage ? { image: page.ogImage } : {}),
  };

  // Campi aggiuntivi specifici per tipo
  if (page.jsonLdType === "Article" || page.jsonLdType === "BlogPosting") {
    jsonLd.headline = name;
    if (page.updatedAt) {
      jsonLd.dateModified = page.updatedAt.toISOString();
    }
  }

  if (page.jsonLdType === "Organization" || page.jsonLdType === "LocalBusiness") {
    jsonLd.url = domain || siteUrl || "";
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}
