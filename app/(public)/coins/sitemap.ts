// app/(public)/coins/sitemap.ts
// Sitemap dedicata al modulo prices: una entry per ogni coin attivo a
// /coins/<symbol>. Genera /coins/sitemap.xml.
//
// Separata dalla sitemap principale (CMS pages) per:
//   - non superare il limite 50k URLs / 50MB di una singola sitemap se il
//     registry coin esplode (oggi ~300 coin, comodo)
//   - fare lastmod corretto: il timestamp di update di un coin è
//     diverso da quello di una pagina CMS, sitemap dedicata = lastmod
//     accurato per crawler
//   - permettere a Google/Bing di pingare solo questa quando aggiorniamo
//     coin senza forzare un re-crawl di tutto
//
// Linkata dal robots.txt (admin → SEO → Robots) o referenziata in un
// sitemap index futuro.

import { db } from "@/lib/db/drizzle";
import { pricesCoins, pricesSyncRuns } from "@/lib/db/schema";
import { getSiteUrl } from "@/lib/seo";
import { and, desc, eq } from "drizzle-orm";
import type { MetadataRoute } from "next";
import { unstable_cache } from "next/cache";

const PRICES_DATA_TAG = "prices-data";

// `lastModified` viene dall'ultimo sync run riuscito (DB, cacheable), NON
// da Redis: la sitemap deve restare statica/ISR per SEO. Usare getHotPrices
// (no-store fetch) la renderebbe dinamica + romperebbe la static generation.
const fetchActiveCoinsForSitemap = unstable_cache(
  async () => {
    const [rows, lastSync] = await Promise.all([
      db
        .select({
          symbol:        pricesCoins.symbol,
          marketCapRank: pricesCoins.marketCapRank,
        })
        .from(pricesCoins)
        .where(eq(pricesCoins.isActive, true))
        .orderBy(desc(pricesCoins.marketCap)),
      db
        .select({ finishedAt: pricesSyncRuns.finishedAt })
        .from(pricesSyncRuns)
        .where(and(eq(pricesSyncRuns.kind, "sync"), eq(pricesSyncRuns.ok, true)))
        .orderBy(desc(pricesSyncRuns.startedAt))
        .limit(1),
    ]);
    return {
      rows,
      lastModifiedMs: lastSync[0]?.finishedAt?.getTime() ?? Date.now(),
    };
  },
  ["prices-coins-sitemap"],
  { revalidate: 300, tags: [PRICES_DATA_TAG] },
);

/**
 * Priority sliding by market cap rank: top 10 = 0.9, top 50 = 0.8, top
 * 200 = 0.7, oltre = 0.5. Google tratta priority come hint relativo
 * tra le URLs della STESSA sitemap, non come ranking factor — serve
 * per dire al crawler quali pagine cruciali ricontrollare prima.
 */
function rankToPriority(rank: number | null): number {
  if (rank === null) return 0.5;
  if (rank <= 10) return 0.9;
  if (rank <= 50) return 0.8;
  if (rank <= 200) return 0.7;
  return 0.5;
}

/**
 * changeFrequency: i prezzi cambiano costantemente, ma `changefreq` è un
 * hint dal vecchio standard sitemap.org. Per le coin che muoviamo ogni
 * 5min "hourly" è onesto; per quelle in fondo al ranking "daily".
 */
function rankToChangeFreq(rank: number | null): MetadataRoute.Sitemap[number]["changeFrequency"] {
  if (rank === null || rank > 200) return "daily";
  return "hourly";
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [{ rows: coins, lastModifiedMs }, siteUrl] = await Promise.all([
    fetchActiveCoinsForSitemap(),
    getSiteUrl(),
  ]);

  if (!siteUrl) return [];

  const lastModified = new Date(lastModifiedMs);

  return coins.map((c) => ({
    url: `${siteUrl}/coins/${c.symbol.toLowerCase()}`,
    lastModified,
    changeFrequency: rankToChangeFreq(c.marketCapRank),
    priority: rankToPriority(c.marketCapRank),
  }));
}
