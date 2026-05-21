// lib/cms/news-feed-queries.ts
//
// Read path delle "page news" — feed cards + listing categoria + metadata
// articolo + nav menu — vive nel CMS CORE (NON dentro `lib/modules/news/`).
//
// Razionale: i template `TemplateNewsHome/Category/News` vivono in
// `app/(cms)/_templates/` (codice CMS core, vedi
// project_news_categories_refactor_inprogress). Il modulo `news` è solo
// uno strato di automazione (RSS → AI rewrite → publish) sopra il CMS.
// Se il modulo viene disinstallato, i template e le page sopravvivono;
// per evitare che i template crashino al build importando da un modulo
// inesistente, le query feed-side stanno qui, non nel modulo.
//
// Dipendenza residua su `news_items`:
//   - `getRecentPublishedNewsCards` + `getNewsCardsByCategories` +
//     `getNewsCardsByParentPageId` + `getNewsMetadataByPageId` joinano
//     in LEFT su `news_items` per il campo `category` (pill della card +
//     fallback nel TemplateNews). Se il modulo viene davvero rimosso e
//     anche la tabella `news_items` viene droppata (vedi
//     `M_news_999_uninstall.sql`), questi LEFT JOIN diventerebbero
//     un riferimento a tabella inesistente → query fail.
//   - Soluzione TODO (non in scope ora): rimuovere la dipendenza
//     usando `parent.slug` come fonte categoria (già fatto per il
//     TemplateNews via `parentSlug`). Per i listing card cliccabili
//     basterebbe estrarre `slug.split('/')[1]` come prefix.
//
// Pattern keyset/cursor non applicato (le query sono LIMIT N "topo della
// pagina", non infinite scroll). Se in futuro la home news supporterà
// infinite scroll, passare a cursor keyset come fa il feed posts.
import "server-only";

import { db } from "@/lib/db/drizzle";
import {
  mediaAssets,
  newsItems,
  pages,
} from "@/lib/db/schema";
import { alias } from "drizzle-orm/pg-core";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";

// ──────────────────────────────────────────────────────────────────────────
// Types pubblici
// ──────────────────────────────────────────────────────────────────────────

export interface NewsCardData {
  pageId: number;
  slug: string;
  title: string;
  publishedAt: Date | null;
  excerpt: string | null;
  heroUrl: string | null;
  /** Varianti webp processate (hero/card/thumb) — popolate al pick
   *  hero in review. Null per articoli pre-processing. I renderer
   *  fanno fallback su `heroUrl` con `pickHeroVariantUrl()`. */
  heroVariants: unknown | null;
  category: string | null;
}

export interface NewsArticleMetadata {
  category: string | null;
  sourcePublishedAt: Date | null;
  /** Varianti webp dell'hero (media_assets.variants). Null se l'asset
   *  non è ancora stato processato — il TemplateNews fa fallback su
   *  `fields.hero_image` (URL originale già resolved). */
  heroVariants: unknown | null;
  /** Slug della page parent (es. "news/bitcoin" per articolo figlio
   *  della categoria, "news" per articolo other/null figlio diretto
   *  della home). Fonte primaria della categoria pubblica
   *  post-refactor news-categories-as-cms-pages. */
  parentSlug: string | null;
}

export interface ActiveNewsCategory {
  /** Slug completo della page categoria (es. "news/bitcoin"). */
  slug: string;
  /** Titolo della page categoria — letto direttamente da `pages.title`
   *  così che rinominare la categoria dall'admin si rifletta subito in
   *  menu, senza override hardcoded lato componente. */
  title: string;
}

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

/**
 * Parser comune per le row del join pages × news_items × media_assets.
 * Estrae `excerpt` dai customFields della page.
 */
function rowToNewsCard(row: {
  pageId: number;
  slug: string;
  title: string;
  publishedAt: Date | null;
  customFields: string | null;
  heroUrl: string | null;
  heroVariants: unknown | null;
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
    heroVariants: row.heroVariants,
    category: row.category,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Feed queries
// ──────────────────────────────────────────────────────────────────────────

/**
 * Articoli pubblicati più recenti (per Hero picks, FeatureStory, Essays).
 * Filtri: pages.page_type='news' AND pages.status='published'.
 * Join opzionale su news_items per la categoria.
 *
 * Hero asset: la source of truth è `pages.custom_fields.hero_image`
 * (lo stesso campo usato da TemplateNews via resolveMediaFields). Cast
 * JSONB sicuro: NULLIF protegge contro `pages.custom_fields` mancante o
 * senza chiave `hero_image`.
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
      heroVariants: mediaAssets.variants,
      category: newsItems.category,
    })
    .from(pages)
    .leftJoin(newsItems, eq(newsItems.publishedPageId, pages.id))
    .leftJoin(
      mediaAssets,
      sql`${mediaAssets.id} = NULLIF(${pages.customFields}::jsonb->>'hero_image', '')::int`,
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
      heroVariants: mediaAssets.variants,
      category: newsItems.category,
    })
    .from(pages)
    .innerJoin(newsItems, eq(newsItems.publishedPageId, pages.id))
    .leftJoin(
      mediaAssets,
      sql`${mediaAssets.id} = NULLIF(${pages.customFields}::jsonb->>'hero_image', '')::int`,
    )
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
 * Articoli figli di una page categoria. Usato da TemplateNewsCategory
 * (listing della pagina /news/<categoria>) nel modello post-refactor
 * news-categories-as-cms-pages.
 *
 * Differenze rispetto a `getNewsCardsByCategories`:
 *   - Filtro su `pages.parent_id = parentPageId` (gerarchia CMS), non
 *     su `news_items.category` (enum). Funziona anche per articoli creati
 *     a mano dall'admin che non hanno una row in news_items.
 *   - Il join su news_items resta LEFT (per ricavare il pill categoria
 *     della card) ma non condiziona la presenza in lista.
 */
export async function getNewsCardsByParentPageId(
  parentPageId: number,
  limit: number,
): Promise<NewsCardData[]> {
  const rows = await db
    .select({
      pageId: pages.id,
      slug: pages.slug,
      title: pages.title,
      publishedAt: pages.publishedAt,
      customFields: pages.customFields,
      heroUrl: mediaAssets.publicUrl,
      heroVariants: mediaAssets.variants,
      category: newsItems.category,
    })
    .from(pages)
    .leftJoin(newsItems, eq(newsItems.publishedPageId, pages.id))
    .leftJoin(
      mediaAssets,
      sql`${mediaAssets.id} = NULLIF(${pages.customFields}::jsonb->>'hero_image', '')::int`,
    )
    .where(
      and(
        eq(pages.pageType, "news"),
        eq(pages.status, "published"),
        eq(pages.parentId, parentPageId),
      ),
    )
    .orderBy(desc(pages.publishedAt))
    .limit(limit);

  return rows.map(rowToNewsCard);
}

/**
 * Metadata per il rendering del singolo articolo (TemplateNews).
 *
 * Query parte da `pages` per coprire anche gli articoli creati a mano
 * dall'admin senza row in news_items. Joins:
 *   - news_items: LEFT, opt → category + sourcePublishedAt come fallback
 *   - parent page (alias): LEFT → parent.slug come fonte primaria categoria
 *   - media_assets: LEFT → hero variants via custom_fields.hero_image
 */
export async function getNewsMetadataByPageId(
  pageId: number,
): Promise<NewsArticleMetadata | null> {
  const parentPages = alias(pages, "parent_pages");
  const [row] = await db
    .select({
      category: newsItems.category,
      sourcePublishedAt: newsItems.sourcePublishedAt,
      heroVariants: mediaAssets.variants,
      parentSlug: parentPages.slug,
    })
    .from(pages)
    .leftJoin(newsItems, eq(newsItems.publishedPageId, pages.id))
    .leftJoin(parentPages, eq(parentPages.id, pages.parentId))
    .leftJoin(
      mediaAssets,
      sql`${mediaAssets.id} = NULLIF(${pages.customFields}::jsonb->>'hero_image', '')::int`,
    )
    .where(eq(pages.id, pageId))
    .limit(1);
  if (!row) return null;
  return {
    category: row.category,
    sourcePublishedAt: row.sourcePublishedAt,
    heroVariants: row.heroVariants,
    parentSlug: row.parentSlug,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Nav menu — active categories
// ──────────────────────────────────────────────────────────────────────────

/**
 * Categorie news con almeno 1 articolo pubblicato. Usato dal menu news
 * della navbar (header pubblico) per mostrare solo le voci che hanno
 * effettivamente contenuto cliccabile dietro.
 *
 * Modello post refactor news-categories-as-cms-pages: ogni categoria è
 * una page CMS figlia di /news con slug `news/<prefix>` (migration
 * M_news_007). Una categoria è "attiva" se esiste almeno una page
 * `page_type='news' AND status='published'` con `parent_id` = id di
 * quella page categoria. Articoli figli diretti di /news (other/NULL
 * category) non contribuiscono — filtro `parent.slug LIKE 'news/%'` li
 * esclude.
 *
 * Ordinamento: `parent.sort_order` (seedata in migration in ordine
 * editoriale: bitcoin=10, ethereum=20, …, tech=80), poi titolo come
 * tie-breaker stabile.
 */
export async function getActiveNewsCategories(): Promise<ActiveNewsCategory[]> {
  const articlePages = alias(pages, "article_pages");
  const rows = await db
    .selectDistinct({
      slug: pages.slug,
      title: pages.title,
      sortOrder: pages.sortOrder,
    })
    .from(articlePages)
    .innerJoin(pages, eq(pages.id, articlePages.parentId))
    .where(
      and(
        eq(articlePages.pageType, "news"),
        eq(articlePages.status, "published"),
        sql`${pages.slug} LIKE 'news/%'`,
      ),
    )
    .orderBy(pages.sortOrder, pages.title);
  return rows.map(({ slug, title }) => ({ slug, title }));
}

/**
 * Wrapper cached di `getActiveNewsCategories` usato dal menu della navbar
 * (hot path: ogni request in contesto news chiama questa funzione).
 *
 * Cache:
 *   - TTL 60s — ragionevole per un menu che cambia raramente.
 *   - Tag "pages" — riusato da `invalidatePageCachesAndSync` chiamato
 *     dalle Server Action di publish/admin save. Fan-out accettabile.
 *
 * Resilient: se la query fallisce, fallback a fresh fetch (try/catch
 * fuori dalla cache così l'errore non viene cachato per 60s).
 */
export async function getCachedActiveNewsCategories(): Promise<ActiveNewsCategory[]> {
  const cached = unstable_cache(
    () => getActiveNewsCategories(),
    ["active-news-categories"],
    { revalidate: 60, tags: ["pages"] },
  );
  try {
    return await cached();
  } catch (err) {
    console.warn(
      "[getCachedActiveNewsCategories] cache lookup failed, falling back to fresh fetch",
      err,
    );
    return await getActiveNewsCategories();
  }
}
