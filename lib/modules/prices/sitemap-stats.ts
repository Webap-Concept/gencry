// lib/modules/prices/sitemap-stats.ts
//
// Stats lookup per la card "Coin pages" della dashboard admin
// /admin/seo/sitemap. Lazy-imported dal manifest del modulo
// (ModuleSitemap.loadStats) → eseguito SOLO quando l'admin apre la
// pagina, mai al boot.
import "server-only";

import { db } from "@/lib/db/drizzle";
import { pricesCoins } from "@/lib/db/schema";
import { getHotPrices } from "./services/hot-prices";
import { eq, sql } from "drizzle-orm";

export default async function getPricesSitemapStats(): Promise<{
  count: number;
  lastModified: Date | null;
}> {
  const [[countRow], hot] = await Promise.all([
    db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(pricesCoins)
      .where(eq(pricesCoins.isActive, true)),
    getHotPrices(),
  ]);
  return {
    count: Number(countRow?.count ?? 0),
    lastModified: hot ? new Date(hot.updatedAt) : null,
  };
}
