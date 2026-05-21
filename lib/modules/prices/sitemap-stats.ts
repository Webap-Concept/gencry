// lib/modules/prices/sitemap-stats.ts
//
// Stats lookup per la card "Coin pages" della dashboard admin
// /admin/seo/sitemap. Lazy-imported dal manifest del modulo
// (ModuleSitemap.loadStats) → eseguito SOLO quando l'admin apre la
// pagina, mai al boot.
//
// Default export = funzione che ritorna { count, lastModified } per la
// card. Safe-to-fail: in caso di errore lato chiamante, la card mostra
// solo URL + bottone "Apri".
import "server-only";

import { db } from "@/lib/db/drizzle";
import { pricesCoins, pricesData } from "@/lib/db/schema";
import { eq, max, sql } from "drizzle-orm";

export default async function getPricesSitemapStats(): Promise<{
  count: number;
  lastModified: Date | null;
}> {
  const [row] = await db
    .select({
      count: sql<number>`COUNT(*)::int`,
      lastModified: max(pricesData.lastUpdated),
    })
    .from(pricesCoins)
    .innerJoin(pricesData, eq(pricesCoins.symbol, pricesData.symbol))
    .where(eq(pricesCoins.isActive, true));
  return {
    count: Number(row?.count ?? 0),
    lastModified: row?.lastModified ?? null,
  };
}
