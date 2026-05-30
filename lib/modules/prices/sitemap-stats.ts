// lib/modules/prices/sitemap-stats.ts
//
// Stats lookup per la card "Coin pages" della dashboard admin
// /admin/seo/sitemap. Lazy-imported dal manifest del modulo
// (ModuleSitemap.loadStats) → eseguito SOLO quando l'admin apre la
// pagina, mai al boot.
import "server-only";

import { db } from "@/lib/db/drizzle";
import { pricesCoins, pricesSyncRuns } from "@/lib/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";

export default async function getPricesSitemapStats(): Promise<{
  count: number;
  lastModified: Date | null;
}> {
  // lastModified dall'ultimo sync run riuscito (DB, niente Redis): questa
  // stat è meta-informativa e non deve dipendere dal hot cache.
  const [[countRow], [lastSync]] = await Promise.all([
    db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(pricesCoins)
      .where(eq(pricesCoins.isActive, true)),
    db
      .select({ finishedAt: pricesSyncRuns.finishedAt })
      .from(pricesSyncRuns)
      .where(and(eq(pricesSyncRuns.kind, "sync"), eq(pricesSyncRuns.ok, true)))
      .orderBy(desc(pricesSyncRuns.startedAt))
      .limit(1),
  ]);
  return {
    count: Number(countRow?.count ?? 0),
    lastModified: lastSync?.finishedAt ?? null,
  };
}
