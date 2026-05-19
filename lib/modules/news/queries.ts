// lib/modules/news/queries.ts
//
// Query del modulo News. Tutte server-side, niente RLS — l'autorizzazione
// è sempre lato app (requireAdmin + can() su `modules:news`).
//
// Convenzione module-isolation: queste query NON sono importate da fuori
// del modulo (eccezione: il cron handler che vive sotto app/api/cron/
// e gli admin pages sotto app/(admin)/admin/modules/news/).
import "server-only";

import { db } from "@/lib/db/drizzle";
import {
  mediaAssets,
  newsItems,
  newsSources,
  pages,
  userProfiles,
  users,
  type NewNewsItem,
  type NewNewsSource,
  type NewsItem,
  type NewsItemStatus,
  type NewsSource,
} from "@/lib/db/schema";
import { and, desc, eq, gte, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { createHash } from "node:crypto";

export type { NewsSource, NewsItem, NewsItemStatus };

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

/**
 * Hash deterministico per dedup. Sha256 di url+title normalizzati. Stesso
 * pattern del SQL — DEVE matchare cosa fa il DB per evitare drift.
 */
export function computeOriginalHash(url: string, title: string): string {
  const normalized = `${url.trim().toLowerCase()}|${title.trim().toLowerCase()}`;
  return createHash("sha256").update(normalized).digest("hex");
}

// ──────────────────────────────────────────────────────────────────────────
// Sources CRUD
// ──────────────────────────────────────────────────────────────────────────

export async function getAllSources(): Promise<NewsSource[]> {
  return db
    .select()
    .from(newsSources)
    .orderBy(desc(newsSources.active), desc(newsSources.weight), newsSources.name);
}

export async function getActiveSources(): Promise<NewsSource[]> {
  return db
    .select()
    .from(newsSources)
    .where(eq(newsSources.active, true))
    .orderBy(desc(newsSources.weight), newsSources.name);
}

export async function getSourceById(id: string): Promise<NewsSource | null> {
  const [row] = await db.select().from(newsSources).where(eq(newsSources.id, id)).limit(1);
  return row ?? null;
}

export async function createSource(data: NewNewsSource): Promise<NewsSource> {
  const [row] = await db.insert(newsSources).values(data).returning();
  return row;
}

export async function updateSource(
  id: string,
  data: Partial<NewNewsSource>,
): Promise<NewsSource | null> {
  const [row] = await db
    .update(newsSources)
    .set(data)
    .where(eq(newsSources.id, id))
    .returning();
  return row ?? null;
}

export async function deleteSourceById(id: string): Promise<void> {
  await db.delete(newsSources).where(eq(newsSources.id, id));
}

/**
 * Marca una source come "fetched correttamente": aggiorna timestamp + etag,
 * azzera error_count.
 */
export async function markSourceFetched(
  id: string,
  opts: { etag?: string | null; lastModified?: string | null } = {},
): Promise<void> {
  await db
    .update(newsSources)
    .set({
      lastFetchedAt: new Date(),
      lastEtag: opts.etag ?? null,
      lastModified: opts.lastModified ?? null,
      errorCount: 0,
      lastError: null,
      lastErrorAt: null,
    })
    .where(eq(newsSources.id, id));
}

export async function markSourceError(id: string, error: string): Promise<void> {
  await db
    .update(newsSources)
    .set({
      errorCount: sql`${newsSources.errorCount} + 1`,
      lastError: error.slice(0, 2000),
      lastErrorAt: new Date(),
    })
    .where(eq(newsSources.id, id));
}

// ──────────────────────────────────────────────────────────────────────────
// Items
// ──────────────────────────────────────────────────────────────────────────

/**
 * Insert idempotente di un item scraperato. Se l'hash esiste già (item già
 * visto) ritorna null senza errore. Usa ON CONFLICT DO NOTHING sull'unique
 * `original_hash`.
 */
export async function insertItemIfNew(
  data: Omit<NewNewsItem, "id" | "createdAt" | "updatedAt" | "status">,
): Promise<NewsItem | null> {
  // Default 'proposed': lo scraper raccoglie senza fetch body né LLM call.
  // L'admin promuove a 'pending_rewrite' via approveItemAction quando vuole
  // pubblicare quello specifico articolo. Risparmia ~90% sui costi LLM.
  const inserted = await db
    .insert(newsItems)
    .values({ ...data, status: "proposed" })
    .onConflictDoNothing({ target: newsItems.originalHash })
    .returning();
  return inserted[0] ?? null;
}

export async function getItemById(id: string): Promise<NewsItem | null> {
  const [row] = await db.select().from(newsItems).where(eq(newsItems.id, id)).limit(1);
  return row ?? null;
}

export interface NewsItemWithRels extends NewsItem {
  sourceName: string | null;
  heroPublicUrl: string | null;
}

/**
 * Lookup join leggero: item + nome source + hero URL. Usato dalla queue
 * admin per evitare N+1.
 */
export async function getItemWithRels(id: string): Promise<NewsItemWithRels | null> {
  const [row] = await db
    .select({
      item: newsItems,
      sourceName: newsSources.name,
      heroPublicUrl: mediaAssets.publicUrl,
    })
    .from(newsItems)
    .leftJoin(newsSources, eq(newsItems.sourceId, newsSources.id))
    .leftJoin(mediaAssets, eq(newsItems.heroAssetId, mediaAssets.id))
    .where(eq(newsItems.id, id))
    .limit(1);
  if (!row) return null;
  return {
    ...row.item,
    sourceName: row.sourceName,
    heroPublicUrl: row.heroPublicUrl,
  };
}

export interface ListItemsOpts {
  status?: NewsItemStatus | NewsItemStatus[];
  limit?: number;
  offset?: number;
}

export async function listItemsWithRels(opts: ListItemsOpts = {}): Promise<NewsItemWithRels[]> {
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;
  const statusFilter = opts.status
    ? Array.isArray(opts.status)
      ? inArray(newsItems.status, opts.status)
      : eq(newsItems.status, opts.status)
    : undefined;

  const rows = await db
    .select({
      item: newsItems,
      sourceName: newsSources.name,
      heroPublicUrl: mediaAssets.publicUrl,
    })
    .from(newsItems)
    .leftJoin(newsSources, eq(newsItems.sourceId, newsSources.id))
    .leftJoin(mediaAssets, eq(newsItems.heroAssetId, mediaAssets.id))
    .where(statusFilter)
    .orderBy(desc(newsItems.createdAt))
    .limit(limit)
    .offset(offset);

  return rows.map((r) => ({ ...r.item, sourceName: r.sourceName, heroPublicUrl: r.heroPublicUrl }));
}

/**
 * Pickup batch per il cron rewriter: prende N items pending_rewrite più
 * vecchi. Marca ai_attempt_count + 1 atomicamente per evitare double-pick
 * tra cron concorrenti.
 *
 * IMPORTANTE: usa il builder drizzle .update().returning() invece di raw
 * SQL `RETURNING *` cast a NewsItem[]. Il cast raw NON fa il mapping
 * snake_case → camelCase, quindi `item.sourceUrl` era undefined (la
 * proprietà arrivava come `source_url`). Il builder mappa correttamente.
 * Il subselect FOR UPDATE SKIP LOCKED resta in raw SQL perché drizzle
 * non lo espone come API tipata.
 */
export async function pickPendingRewriteBatch(batchSize: number): Promise<NewsItem[]> {
  return db
    .update(newsItems)
    .set({
      aiAttemptCount: sql`${newsItems.aiAttemptCount} + 1`,
      updatedAt: new Date(),
    })
    .where(
      sql`${newsItems.id} IN (
        SELECT id FROM news_items
        WHERE status = 'pending_rewrite'
        ORDER BY created_at ASC
        LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED
      )`,
    )
    .returning();
}

/**
 * Pickup degli items scheduled con due. Stesso pattern del rewriter:
 * SKIP LOCKED per concorrenza, builder drizzle per il mapping camelCase.
 */
export async function pickDuePublishingBatch(batchSize: number): Promise<NewsItem[]> {
  return db
    .update(newsItems)
    .set({ updatedAt: new Date() })
    .where(
      sql`${newsItems.id} IN (
        SELECT id FROM news_items
        WHERE status = 'scheduled'
          AND scheduled_publish_at <= NOW()
        ORDER BY scheduled_publish_at ASC
        LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED
      )`,
    )
    .returning();
}

export async function updateItem(
  id: string,
  data: Partial<NewNewsItem>,
): Promise<NewsItem | null> {
  const [row] = await db
    .update(newsItems)
    .set(data)
    .where(eq(newsItems.id, id))
    .returning();
  return row ?? null;
}

// Contatori per overview admin (dashboard).
export interface NewsStatusCounts {
  proposed: number;
  pending_rewrite: number;
  review: number;
  scheduled: number;
  published: number;
  rejected: number;
  failed: number;
}

export async function getStatusCounts(): Promise<NewsStatusCounts> {
  const rows = await db
    .select({
      status: newsItems.status,
      count: sql<number>`cast(count(*) as integer)`,
    })
    .from(newsItems)
    .groupBy(newsItems.status);

  const out: NewsStatusCounts = {
    proposed: 0,
    pending_rewrite: 0,
    review: 0,
    scheduled: 0,
    published: 0,
    rejected: 0,
    failed: 0,
  };
  for (const r of rows) {
    if (r.status in out) {
      out[r.status as keyof NewsStatusCounts] = r.count;
    }
  }
  return out;
}

/**
 * Auto-reject batch: usato dal cron cleanup-proposed. Sposta a 'rejected' i
 * proposed più vecchi di cutoff. Ritorna il count.
 */
export async function autoRejectProposedOlderThan(cutoff: Date): Promise<number> {
  const updated = await db
    .update(newsItems)
    .set({
      status: "rejected",
      rejectedReason: "Auto-rejected after retention window",
      reviewedAt: new Date(),
    })
    .where(
      and(eq(newsItems.status, "proposed"), lt(newsItems.createdAt, cutoff)),
    )
    .returning({ id: newsItems.id });
  return updated.length;
}

/**
 * Quanti articoli pubblicati nel range [from, to). Usato per il guardrail
 * di scheduling "max N/day" e per il widget overview.
 */
export async function countPublishedBetween(from: Date, to: Date): Promise<number> {
  // gte/lt invece di sql`${col} >= ${date}`: il driver postgres-js non
  // marshalla Date passati come raw param SQL ("ERR_INVALID_ARG_TYPE:
  // Received an instance of Date"), i builder drizzle fanno il toISOString
  // per i timestamptz.
  const [row] = await db
    .select({ count: sql<number>`cast(count(*) as integer)` })
    .from(newsItems)
    .where(
      and(
        eq(newsItems.status, "published"),
        isNotNull(newsItems.publishedAt),
        gte(newsItems.publishedAt, from),
        lt(newsItems.publishedAt, to),
      ),
    );
  return row?.count ?? 0;
}

/**
 * Conteggio degli scheduled in un range (per spalmare quote "2/giorno").
 */
export async function countScheduledBetween(from: Date, to: Date): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`cast(count(*) as integer)` })
    .from(newsItems)
    .where(
      and(
        eq(newsItems.status, "scheduled"),
        gte(newsItems.scheduledPublishAt, from),
        lt(newsItems.scheduledPublishAt, to),
      ),
    );
  return row?.count ?? 0;
}

/**
 * Reviewer username per la timeline admin. Lookup join con user_profiles
 * per lo username (che vive nel sidecar profile), fallback all'email.
 */
export async function getReviewerName(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ username: userProfiles.username, email: users.email })
    .from(users)
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) return null;
  return row.username ?? row.email ?? null;
}

// ──────────────────────────────────────────────────────────────────────────
// Public listing helpers — usati da /news (listing pubblico). Query
// dedicate che join-ano pages + news_items + media_assets per restituire
// una shape pronta-per-render in un solo round-trip.
// ──────────────────────────────────────────────────────────────────────────

export interface NewsCardData {
  pageId: number;
  slug: string;
  title: string;
  publishedAt: Date | null;
  excerpt: string | null;
  heroUrl: string | null;
  category: string | null;
}

/**
 * Parser comune per le row del join pages × news_items × media_assets.
 * Estrae `excerpt` dai customFields della page (più affidabile della
 * versione in news_items.generated_excerpt_it che resta storica).
 */
function rowToNewsCard(row: {
  pageId: number;
  slug: string;
  title: string;
  publishedAt: Date | null;
  customFields: string | null;
  heroUrl: string | null;
  category: string | null;
}): NewsCardData {
  let excerpt: string | null = null;
  try {
    const parsed = JSON.parse(row.customFields ?? "{}") as Record<string, string>;
    excerpt = parsed.excerpt ?? null;
  } catch {
    /* invalid JSON → no excerpt */
  }
  return {
    pageId: row.pageId,
    slug: row.slug,
    title: row.title,
    publishedAt: row.publishedAt,
    excerpt,
    heroUrl: row.heroUrl,
    category: row.category,
  };
}

/**
 * Articoli pubblicati più recenti (per Hero picks, FeatureStory, Essays).
 * Filtri: pages.page_type='news' AND pages.status='published'.
 * Join opzionale su news_items per la categoria (l'articolo può esistere
 * come page senza news_items match se creato a mano dall'admin).
 */
export async function getRecentPublishedNewsCards(limit: number): Promise<NewsCardData[]> {
  const rows = await db
    .select({
      pageId: pages.id,
      slug: pages.slug,
      title: pages.title,
      publishedAt: pages.publishedAt,
      customFields: pages.customFields,
      heroUrl: mediaAssets.publicUrl,
      category: newsItems.category,
    })
    .from(pages)
    .leftJoin(newsItems, eq(newsItems.publishedPageId, pages.id))
    .leftJoin(
      mediaAssets,
      // Hero asset id is stored as string in pages.customFields.hero_image;
      // qui ci appoggiamo a newsItems.heroAssetId che è la fonte canonica.
      eq(mediaAssets.id, newsItems.heroAssetId),
    )
    .where(and(eq(pages.pageType, "news"), eq(pages.status, "published")))
    .orderBy(desc(pages.publishedAt))
    .limit(limit);

  return rows.map(rowToNewsCard);
}

/**
 * Articoli per gruppo di categorie. Usato dalle 3 colonne del listing
 * (Mercati / Onchain / Guide ognuna mappa a più category enum del DB).
 *
 * NB: il filtro categoria è su news_items.category — se l'admin pubblica
 * una page news a mano (senza passare dal modulo), non avrà categoria
 * e NON apparirà in nessuna colonna. Atteso.
 */
export async function getNewsCardsByCategories(
  categories: readonly string[],
  limit: number,
): Promise<NewsCardData[]> {
  if (categories.length === 0) return [];
  const rows = await db
    .select({
      pageId: pages.id,
      slug: pages.slug,
      title: pages.title,
      publishedAt: pages.publishedAt,
      customFields: pages.customFields,
      heroUrl: mediaAssets.publicUrl,
      category: newsItems.category,
    })
    .from(pages)
    .innerJoin(newsItems, eq(newsItems.publishedPageId, pages.id))
    .leftJoin(mediaAssets, eq(mediaAssets.id, newsItems.heroAssetId))
    .where(
      and(
        eq(pages.pageType, "news"),
        eq(pages.status, "published"),
        inArray(newsItems.category, categories as string[]),
      ),
    )
    .orderBy(desc(pages.publishedAt))
    .limit(limit);

  return rows.map(rowToNewsCard);
}

/**
 * Cleanup helper (no cron in PR-1, ma utile da CLI in futuro): cancella
 * gli items rejected vecchi >N giorni per non far crescere indefinitamente
 * la tabella.
 */
export async function deleteRejectedOlderThan(cutoff: Date): Promise<number> {
  const res = await db.execute(sql`
    DELETE FROM news_items
    WHERE status = 'rejected'
      AND updated_at < ${cutoff}
    RETURNING id;
  `);
  return Array.isArray(res) ? res.length : 0;
}
