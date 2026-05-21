// app/sitemap.ts
//
// Sitemap principale del CMS — feature core, sempre presente.
// Genera /sitemap.xml con tutte le `pages` published+public. Le news
// post-refactor sono normali CMS pages → cadono dentro automaticamente.
// Discriminator semantico ("è una news?") = template slug (NEWS_TEMPLATE_SLUG).
//
// Sitemap dei moduli (coins, posts, ecc.) restano file separati nei loro
// route group e vengono dichiarate dal `ModuleManifest.sitemap`. Il
// robots.txt le linkka tutte tramite righe `Sitemap:` multiple — niente
// sitemap index XML perché bots leggono multi-line Sitemap senza
// indirezione.
//
// Cache: 5min + tag "pages" (lo stesso che invalidatePageCachesAndSync
// triggera al publish/save). Cap conservativo a 5000 entries con log
// warning se superato — sentinella ben prima del limit 50k di sitemap.org.
//
// Esclude:
//   - status != 'published'
//   - visibility != 'public' (private/draft)
//   - system pages meta-only (is_system=true AND content_editable=false):
//     sono container amministrativi senza un URL navigabile (es. /sign-in,
//     /admin), cms-page.tsx fa notFound() su quelle.

import { db } from "@/lib/db/drizzle";
import { pages, pageTemplates } from "@/lib/db/schema";
import { getSiteUrl } from "@/lib/seo";
import { and, eq, or } from "drizzle-orm";
import type { MetadataRoute } from "next";
import { unstable_cache } from "next/cache";

const CMS_PAGES_TAG = "pages";
const ENTRIES_CAP = 5000;
const NEWS_TEMPLATE_SLUG = "news";

interface CmsSitemapRow {
  slug: string;
  updatedAt: Date;
  /** Template slug della page (es. "news", "news-home", "news-category",
   *  "page", null se la page non ha template). Discriminator semantico
   *  per la derivazione di priority/changeFrequency. */
  templateSlug: string | null;
}

const fetchCmsPagesForSitemap = unstable_cache(
  async (): Promise<CmsSitemapRow[]> => {
    const rows = await db
      .select({
        slug: pages.slug,
        updatedAt: pages.updatedAt,
        templateSlug: pageTemplates.slug,
      })
      .from(pages)
      .leftJoin(pageTemplates, eq(pageTemplates.id, pages.templateId))
      .where(
        and(
          eq(pages.status, "published"),
          eq(pages.visibility, "public"),
          // Esclude system meta-only pages: sono container admin senza
          // URL navigabile pubblico.
          or(
            eq(pages.isSystem, false),
            eq(pages.contentEditable, true),
          ),
        ),
      )
      .orderBy(pages.slug)
      .limit(ENTRIES_CAP + 1);

    if (rows.length > ENTRIES_CAP) {
      console.warn(
        `[sitemap] CMS pages count (${rows.length}) supera il cap di ${ENTRIES_CAP}. ` +
          "Tronco — passa a sitemap index quando capita di nuovo.",
      );
      return rows.slice(0, ENTRIES_CAP);
    }
    return rows;
  },
  ["cms-pages-sitemap"],
  { revalidate: 300, tags: [CMS_PAGES_TAG] },
);

/**
 * Priority + changeFrequency derivate dal template slug + slug pattern.
 * Logica intentionalmente semplice (no DB column override): se in futuro
 * serve fine-tune per-page, aggiungere campi opzionali `sitemap_priority`
 * + `sitemap_changefreq` sulla pages table.
 */
function deriveSitemapHints(
  slug: string,
  templateSlug: string | null,
): {
  priority: number;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
} {
  // Homepage
  if (slug === "") return { priority: 1.0, changeFrequency: "daily" };

  // Home news (`slug='news'` con template "news-home").
  if (templateSlug === "news-home" || slug === "news") {
    return { priority: 0.9, changeFrequency: "daily" };
  }

  // Categoria news (`slug='news/<x>'` con template "news-category").
  if (templateSlug === "news-category") {
    return { priority: 0.8, changeFrequency: "daily" };
  }

  // Articolo news (template "news"). Slug tipico
  // `news/<categoria>/<leaf>` oppure `news/<leaf>` per other/NULL.
  if (templateSlug === NEWS_TEMPLATE_SLUG) {
    return { priority: 0.7, changeFrequency: "daily" };
  }

  // Pages generiche (legals, chi-siamo, informational).
  return { priority: 0.5, changeFrequency: "monthly" };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [rows, siteUrl] = await Promise.all([
    fetchCmsPagesForSitemap(),
    getSiteUrl(),
  ]);

  if (!siteUrl) return [];

  return rows.map((row) => {
    // Caveat: unstable_cache serializza i Date a string a cache hit.
    // Normalizzo qui in un Date vero per Next.js.
    const updated = new Date(row.updatedAt);
    const { priority, changeFrequency } = deriveSitemapHints(
      row.slug,
      row.templateSlug,
    );
    const url = row.slug === "" ? siteUrl : `${siteUrl}/${row.slug}`;
    return { url, lastModified: updated, changeFrequency, priority };
  });
}

// Export interno usato dalla dashboard admin /admin/seo/sitemap per
// mostrare count + lastModified senza ri-eseguire la sitemap completa.
export async function getCmsSitemapStats(): Promise<{
  count: number;
  lastModified: Date | null;
}> {
  const rows = await fetchCmsPagesForSitemap();
  if (rows.length === 0) return { count: 0, lastModified: null };
  let mostRecent: Date | null = null;
  for (const r of rows) {
    const d = new Date(r.updatedAt);
    if (!mostRecent || d > mostRecent) mostRecent = d;
  }
  return { count: rows.length, lastModified: mostRecent };
}

