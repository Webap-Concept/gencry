// lib/modules/news/ingestion.ts
//
// Ingestion service: fetch un feed RSS/Atom + dedup + insert items nuovi.
// Chiamato dal cron handler `/api/cron/modules/news/ingestion`.
//
// Pattern:
//   - HTTP cache hints: passa If-None-Match / If-Modified-Since dalla
//     last_fetched_at della source. Se il server risponde 304, skip.
//   - Dedup: original_hash UNIQUE su (url|title) — insertItemIfNew fa
//     ON CONFLICT DO NOTHING, quindi è idempotente. Re-run = no-op.
//   - Errori: una source rotta non blocca le altre. Catch + markSourceError,
//     loop continua.
//
// Test in dev: chiama direttamente `ingestSource(source)` da un endpoint
// admin "Run now" sulla card source.
import "server-only";

import Parser from "rss-parser";
import {
  computeOriginalHash,
  insertItemIfNew,
  markSourceError,
  markSourceFetched,
  type NewsSource,
} from "./queries";

const FETCH_TIMEOUT_MS = 15_000;

interface FeedItemNormalized {
  title: string;
  link: string;
  excerpt: string | null;
  contentRaw: string;
  publishedAt: Date | null;
}

// rss-parser usa generics per campi custom. Per la pipeline IT ci basta
// title/link/content/contentSnippet/pubDate/isoDate del default schema.
const parser = new Parser({
  timeout: FETCH_TIMEOUT_MS,
  headers: {
    "User-Agent":
      "GenerazioneCrypto-News-Ingestion/1.0 (+https://generazionecrypto.com)",
    Accept: "application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.8",
  },
});

function normalizeItem(
  raw: Parser.Item,
): FeedItemNormalized | null {
  const title = raw.title?.trim();
  const link = raw.link?.trim();
  if (!title || !link) return null;

  const rawWithExtras = raw as Parser.Item & {
    "content:encoded"?: string;
    summary?: string;
  };
  const contentRaw =
    rawWithExtras["content:encoded"] ??
    rawWithExtras.content ??
    rawWithExtras.contentSnippet ??
    rawWithExtras.summary ??
    "";

  const excerpt =
    raw.contentSnippet?.trim().slice(0, 500) ??
    rawWithExtras.summary?.trim().slice(0, 500) ??
    null;

  let publishedAt: Date | null = null;
  if (raw.isoDate) {
    const d = new Date(raw.isoDate);
    if (!Number.isNaN(d.getTime())) publishedAt = d;
  } else if (raw.pubDate) {
    const d = new Date(raw.pubDate);
    if (!Number.isNaN(d.getTime())) publishedAt = d;
  }

  return { title, link, excerpt, contentRaw, publishedAt };
}

export interface IngestSourceResult {
  fetched: boolean;        // false se 304 / etag match
  itemsSeen: number;
  itemsInserted: number;
  durationMs: number;
}

/**
 * Esegue un fetch su una source + insert dei nuovi items. Idempotente.
 *
 * @param maxItems  numero massimo di items da processare per questo fetch
 *                  (anti-overload: feed con 100 items non sgancia 100
 *                  rewrite simultanei).
 */
export async function ingestSource(
  source: NewsSource,
  maxItems: number,
): Promise<IngestSourceResult> {
  const start = Date.now();

  let feedXml: string;
  let etag: string | null = null;
  let lastModified: string | null = null;

  try {
    const headers: Record<string, string> = {
      "User-Agent": "GenerazioneCrypto-News-Ingestion/1.0",
    };
    if (source.lastEtag) headers["If-None-Match"] = source.lastEtag;
    if (source.lastModified) headers["If-Modified-Since"] = source.lastModified;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const res = await fetch(source.feedUrl, {
        headers,
        signal: controller.signal,
        cache: "no-store",
      });

      if (res.status === 304) {
        // Niente di nuovo. Aggiorna last_fetched_at + etag, niente parse.
        await markSourceFetched(source.id, {
          etag: source.lastEtag,
          lastModified: source.lastModified,
        });
        return {
          fetched: false,
          itemsSeen: 0,
          itemsInserted: 0,
          durationMs: Date.now() - start,
        };
      }

      if (!res.ok) {
        await markSourceError(source.id, `HTTP ${res.status} ${res.statusText}`);
        return { fetched: false, itemsSeen: 0, itemsInserted: 0, durationMs: Date.now() - start };
      }

      etag = res.headers.get("etag");
      lastModified = res.headers.get("last-modified");
      feedXml = await res.text();
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    const message =
      err instanceof Error && err.name === "AbortError"
        ? `Timeout (${FETCH_TIMEOUT_MS}ms)`
        : err instanceof Error
        ? err.message
        : String(err);
    await markSourceError(source.id, message);
    return { fetched: false, itemsSeen: 0, itemsInserted: 0, durationMs: Date.now() - start };
  }

  let feed: Parser.Output<Record<string, unknown>>;
  try {
    feed = await parser.parseString(feedXml);
  } catch (err) {
    await markSourceError(
      source.id,
      `Parse error: ${(err as Error).message ?? String(err)}`,
    );
    return { fetched: true, itemsSeen: 0, itemsInserted: 0, durationMs: Date.now() - start };
  }

  const items = (feed.items ?? []).slice(0, maxItems);
  let inserted = 0;

  for (const rawItem of items) {
    const norm = normalizeItem(rawItem);
    if (!norm) continue;

    const hash = computeOriginalHash(norm.link, norm.title);

    const result = await insertItemIfNew({
      sourceId: source.id,
      sourceUrl: norm.link,
      sourceTitle: norm.title,
      sourceExcerpt: norm.excerpt,
      sourcePublishedAt: norm.publishedAt,
      originalHash: hash,
      // Tutto il resto è nullable; popolato dal rewriter cron.
      generatedTitleIt: null,
      generatedBodyItMd: null,
      generatedExcerptIt: null,
      category: null,
      heroAssetId: null,
      scheduledPublishAt: null,
      publishedAt: null,
      publishedPageId: null,
      reviewedBy: null,
      reviewedAt: null,
      rejectedReason: null,
      aiModel: null,
      aiPromptVersion: null,
      aiLastError: null,
    });

    if (result) {
      inserted += 1;
      // Salviamo il contenuto raw del feed dentro source_excerpt esteso?
      // No: lo lasciamo da fetcher live. Il rewriter cron rifà fetch sulla
      // sourceUrl per ottenere il body completo (gli RSS feed spesso danno
      // solo excerpt). Vedi rewriter cron handler.
    }
  }

  await markSourceFetched(source.id, { etag, lastModified });

  return {
    fetched: true,
    itemsSeen: items.length,
    itemsInserted: inserted,
    durationMs: Date.now() - start,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Article body fetch (chiamato dal rewriter cron per ottenere il body
// completo dall'URL dell'articolo, dato che gli RSS feed spesso danno solo
// l'excerpt).
// ──────────────────────────────────────────────────────────────────────────

const ARTICLE_FETCH_TIMEOUT_MS = 12_000;

/**
 * Scarica il body HTML di un articolo dato il suo URL. Strip è demandato al
 * rewriter (sanitizeSourceBody in rewriter.ts). Ritorna null se 404/timeout/
 * non-200.
 */
export async function fetchArticleBody(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ARTICLE_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "GenerazioneCrypto-News-Ingestion/1.0",
        Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
      },
      signal: controller.signal,
      cache: "no-store",
      redirect: "follow",
    });
    if (!res.ok) return null;
    const html = await res.text();
    return html;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
