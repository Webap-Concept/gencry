// lib/modules/posts/sitemap-stats.ts
//
// Stats lookup per la card "Posts" della dashboard admin
// /admin/seo/sitemap. Lazy-imported dal manifest del modulo
// (ModuleSitemap.loadStats).
//
// Allineato al filtro di `/post/sitemap.xml`: post public + non deleted.
// lastModified = max(created_at): i post non sono editabili dopo 10min e
// non hanno un updated_at significativo per la sitemap.
import "server-only";

import { db } from "@/lib/db/drizzle";
import { posts } from "@/lib/db/schema";
import { and, eq, isNull, max, sql } from "drizzle-orm";

export default async function getPostsSitemapStats(): Promise<{
  count: number;
  lastModified: Date | null;
}> {
  const [row] = await db
    .select({
      count: sql<number>`COUNT(*)::int`,
      lastModified: max(posts.createdAt),
    })
    .from(posts)
    .where(and(eq(posts.visibility, "public"), isNull(posts.deletedAt)));
  return {
    count: Number(row?.count ?? 0),
    lastModified: row?.lastModified ?? null,
  };
}
