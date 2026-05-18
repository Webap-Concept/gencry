// app/(public)/post/sitemap.ts
// Sitemap dedicata ai post pubblici del modulo posts: una entry per
// ciascun post con visibility='public' e non deleted. Genera
// /post/sitemap.xml.
//
// Separata dalla sitemap principale (CMS pages) e da /coins/sitemap.xml
// per i motivi documentati in app/(public)/coins/sitemap.ts (limit 50k
// URLs, lastmod accurato, crawler ping mirato).
//
// Linkata dal robots.txt admin → SEO o referenziata in un sitemap index
// futuro. Cap conservativo a 5000 entries (vedi getPublicPostsForSitemap);
// se il modulo cresce oltre, passare a sitemap index.

import { getPublicPostsForSitemap } from "@/lib/modules/posts/queries";
import { getSiteUrl } from "@/lib/seo";
import type { MetadataRoute } from "next";
import { unstable_cache } from "next/cache";

const POSTS_FEED_TAG = "posts:feed";

/**
 * Cache 5 min: la sitemap non deve essere fresca a 60s; i bot non
 * crawlano così spesso. Tag `posts:feed` è già invalidato dalle
 * Server Action di create/delete (services/feed-cache.ts) → la
 * sitemap si rigenera quando il feed cambia.
 */
const fetchPostsForSitemap = unstable_cache(
  async () => getPublicPostsForSitemap(),
  ["posts-public-sitemap"],
  { revalidate: 300, tags: [POSTS_FEED_TAG] },
);

/**
 * Priority sliding by recency:
 *   - <= 7 giorni  → 0.8 (golden window: appena pubblicato, hot)
 *   - <= 30 giorni → 0.6
 *   - oltre        → 0.4
 *
 * Google tratta priority come hint relativo tra le URLs della STESSA
 * sitemap, non come ranking factor. Serve per dirgli quali ricontrollare
 * prima.
 */
function ageToPriority(createdAt: Date): number {
  const ageDays = (Date.now() - createdAt.getTime()) / 86_400_000;
  if (ageDays <= 7) return 0.8;
  if (ageDays <= 30) return 0.6;
  return 0.4;
}

/**
 * changeFrequency: i post sono editabili solo per 10min dopo la
 * creazione, poi sono immutabili (no admin-edit oggi). "weekly" è
 * onesto come hint generico — il crawler aggiorna comunque su
 * cambio del lastmod.
 */
function ageToChangeFreq(
  createdAt: Date,
): MetadataRoute.Sitemap[number]["changeFrequency"] {
  const ageDays = (Date.now() - createdAt.getTime()) / 86_400_000;
  if (ageDays <= 1) return "hourly";
  if (ageDays <= 7) return "daily";
  return "weekly";
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [postsList, siteUrl] = await Promise.all([
    fetchPostsForSitemap(),
    getSiteUrl(),
  ]);

  if (!siteUrl) return [];

  // Caveat: unstable_cache serializza i Date a string a cache hit
  // (vedi memory architecture posts §Caveats). Normalizzo qui in
  // un Date vero prima di passarlo a Next.js (lastModified.getTime)
  // e alle nostre due helper.
  return postsList.map((p) => {
    const created = new Date(p.createdAt);
    return {
      url: `${siteUrl}/post/${p.id}`,
      lastModified: created,
      changeFrequency: ageToChangeFreq(created),
      priority: ageToPriority(created),
    };
  });
}
