// lib/modules/prices/enrichment.ts
//
// Enrichment dei metadata dei coin via CoinGecko Free.
//
// Pensato per "completare" i coin importati wholesale da Binance/KuCoin:
// quelli arrivano in DB con `name = symbol` placeholder e `image_url = null`,
// senza coingecko_id ne' marketCapRank. Questo modulo:
//
//   1. Scarica una sola volta `/coins/list` (~17000 coin, free, no rate
//      limit pesante) → mappa symbol → coingecko_id candidati.
//   2. Carica i coin attivi DB con `coingecko_id IS NULL`, max N.
//   3. Per ogni symbol DB → candidati coingecko_id (puo' essere > 1 per
//      ticker collidenti, es. "ETH" condiviso). Tiene tutti i candidati.
//   4. Batch `/coins/markets?ids=...&per_page=250&sparkline=true` per
//      recuperare market_cap_rank + image + sparkline. Il match "vero"
//      e' quello con market_cap_rank piu' basso (= miglior coin per quel
//      symbol).
//   5. Per ogni vincitore: PUT logo su R2 (immutabile) + UPDATE row con
//      `coingecko_id, name, image_url, market_cap, market_cap_rank,
//      weekly_sparkline`.
//
// Idempotente: re-run skippa i coin gia' arricchiti (filter
// `coingecko_id IS NULL`). Rate-limit aware: max ~25 call CoinGecko per
// run (1 per /list + 4-8 per /markets a batch di 250 + N per /coins/<id>
// solo se servono dati non in markets).

import "server-only";

import { db } from "@/lib/db/drizzle";
import { pricesCoins } from "@/lib/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { getPricesConfig } from "./config";
import { mirrorCoinImage } from "./storage";

const COINGECKO_FREE_BASE = "https://api.coingecko.com/api/v3";
const COINGECKO_PRO_BASE = "https://pro-api.coingecko.com/api/v3";
const TIMEOUT_MS = 15_000;
const MARKETS_BATCH = 250;

interface CoingeckoEndpoint {
  baseUrl: string;
  headers: Record<string, string>;
}

async function resolveEndpoint(): Promise<CoingeckoEndpoint> {
  const cfg = await getPricesConfig();
  if (cfg.coingeckoProEnabled && cfg.coingeckoProApiKey) {
    return {
      baseUrl: COINGECKO_PRO_BASE,
      headers: {
        Accept: "application/json",
        "x-cg-pro-api-key": cfg.coingeckoProApiKey,
      },
    };
  }
  return {
    baseUrl: COINGECKO_FREE_BASE,
    headers: { Accept: "application/json" },
  };
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

interface CoingeckoListItem {
  id: string;
  symbol: string;
  name: string;
}

interface CoingeckoMarketsItem {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price?: number;
  market_cap?: number;
  market_cap_rank?: number;
  sparkline_in_7d?: { price?: number[] };
}

export interface EnrichmentResult {
  ok: true;
  candidatesLoaded: number;
  matched: number;
  enriched: number;
  noMatch: number;
  errors: number;
  imageMirrorFailed: number;
  enrichedSamples: string[];
}

export interface EnrichmentError {
  ok: false;
  error: string;
}

/**
 * Esegue 1 pass di enrichment metadata da CoinGecko. `maxCount` limita
 * quante coin trattare per invocazione (default 200) — l'admin puo' ri-
 * lanciare l'action fino a esaurire i coin con `coingecko_id IS NULL`.
 */
export async function runMetadataEnrichment(
  maxCount: number,
): Promise<EnrichmentResult | EnrichmentError> {
  const n = Math.min(Math.max(Math.trunc(maxCount || 0), 1), 1000);

  // 1. Coin DB da arricchire (no coingecko_id ancora).
  const candidates = await db
    .select({
      symbol: pricesCoins.symbol,
      name: pricesCoins.name,
    })
    .from(pricesCoins)
    .where(
      and(
        eq(pricesCoins.isActive, true),
        isNull(pricesCoins.coingeckoId),
      ),
    )
    .orderBy(pricesCoins.symbol)
    .limit(n);

  if (candidates.length === 0) {
    return {
      ok: true,
      candidatesLoaded: 0,
      matched: 0,
      enriched: 0,
      noMatch: 0,
      errors: 0,
      imageMirrorFailed: 0,
      enrichedSamples: [],
    };
  }

  // 2. CoinGecko /coins/list → tutti i ~17000 coin con symbol+id+name.
  let endpoint: CoingeckoEndpoint;
  let listData: CoingeckoListItem[];
  try {
    endpoint = await resolveEndpoint();
    const url = `${endpoint.baseUrl}/coins/list?include_platform=false`;
    const res = await fetchWithTimeout(url, {
      headers: endpoint.headers,
      cache: "no-store",
    });
    if (!res.ok) {
      return { ok: false, error: `CoinGecko /coins/list HTTP ${res.status}` };
    }
    listData = (await res.json()) as CoingeckoListItem[];
  } catch (err) {
    return {
      ok: false,
      error: `CoinGecko /coins/list ${
        err instanceof Error ? err.message : "unknown"
      }`,
    };
  }

  // Build symbol(uppercase) → [id, ...] (puo' essere multi-id collidente).
  const symbolToIds = new Map<string, string[]>();
  for (const item of listData) {
    const sym = item.symbol?.toUpperCase();
    if (!sym) continue;
    const ids = symbolToIds.get(sym) ?? [];
    ids.push(item.id);
    symbolToIds.set(sym, ids);
  }

  // 3. Per ogni candidate DB → lista candidate ids CoinGecko.
  const allCandidateIds = new Set<string>();
  const dbCandidateMatches = new Map<string, string[]>(); // dbSymbol → candidate ids
  let noMatch = 0;
  for (const c of candidates) {
    const ids = symbolToIds.get(c.symbol.toUpperCase());
    if (!ids || ids.length === 0) {
      noMatch++;
      dbCandidateMatches.set(c.symbol, []);
      continue;
    }
    dbCandidateMatches.set(c.symbol, ids);
    for (const id of ids) allCandidateIds.add(id);
  }

  if (allCandidateIds.size === 0) {
    return {
      ok: true,
      candidatesLoaded: candidates.length,
      matched: 0,
      enriched: 0,
      noMatch,
      errors: 0,
      imageMirrorFailed: 0,
      enrichedSamples: [],
    };
  }

  // 4. /coins/markets batched per recuperare marketCapRank, image, sparkline.
  //    CoinGecko Free limit: 250 ids per call. Restituisce solo gli id
  //    che hanno market data (i ghost-id collidenti vengono filtrati).
  const idsArr = Array.from(allCandidateIds);
  const marketsData = new Map<string, CoingeckoMarketsItem>();
  let errors = 0;

  for (let i = 0; i < idsArr.length; i += MARKETS_BATCH) {
    const batch = idsArr.slice(i, i + MARKETS_BATCH);
    const url = new URL(`${endpoint.baseUrl}/coins/markets`);
    url.searchParams.set("vs_currency", "usd");
    url.searchParams.set("ids", batch.join(","));
    url.searchParams.set("per_page", String(MARKETS_BATCH));
    url.searchParams.set("page", "1");
    url.searchParams.set("sparkline", "true");
    url.searchParams.set("price_change_percentage", "24h");
    try {
      const res = await fetchWithTimeout(url.toString(), {
        headers: endpoint.headers,
        cache: "no-store",
      });
      if (!res.ok) {
        errors++;
        continue;
      }
      const items = (await res.json()) as CoingeckoMarketsItem[];
      for (const it of items) marketsData.set(it.id, it);
    } catch {
      errors++;
    }
  }

  // 5. Per ogni candidate DB: vincitore = candidate id con marketCapRank
  //    piu' basso (= miglior coin per quel symbol). Coin senza data in
  //    /markets sono ghost-id (collisione di ticker su token morti) →
  //    skip.
  let matched = 0;
  let enriched = 0;
  let imageMirrorFailed = 0;
  const enrichedSamples: string[] = [];
  const cfg = await getPricesConfig();

  for (const [dbSymbol, candidateIds] of dbCandidateMatches.entries()) {
    if (candidateIds.length === 0) continue;
    // Scegli il vincitore (lowest rank, fallback al primo con data).
    let winner: CoingeckoMarketsItem | null = null;
    for (const id of candidateIds) {
      const m = marketsData.get(id);
      if (!m) continue;
      if (
        !winner ||
        (m.market_cap_rank ?? Infinity) <
          (winner.market_cap_rank ?? Infinity)
      ) {
        winner = m;
      }
    }
    if (!winner) continue;
    matched++;

    // Mirror logo su R2 (best-effort: se R2 manca o fallisce, salva URL
    // CoinGecko diretto come fallback).
    let imageUrl: string | null = null;
    if (winner.image) {
      try {
        imageUrl = await mirrorCoinImage(cfg.r2, dbSymbol, winner.image);
      } catch {
        imageMirrorFailed++;
        imageUrl = null;
      }
      if (!imageUrl) imageUrl = winner.image;
    }

    // Sparkline7d compattata: prendi gli ultimi 168 (1 punto/ora ≈ 7gg)
    // poi downsample a 21 punti (uno ogni 8h).
    const rawSpark = winner.sparkline_in_7d?.price ?? null;
    const compact = downsampleSparkline(rawSpark);

    const hasSpark = compact !== null && compact.length >= 2;

    try {
      await db
        .update(pricesCoins)
        .set({
          coingeckoId: winner.id,
          name: winner.name || dbSymbol,
          imageUrl,
          marketCap: winner.market_cap ?? null,
          marketCapRank: winner.market_cap_rank ?? null,
          // weekly_sparkline ora vive in prices_coins: incluso nello stesso
          // UPDATE (no più query separata su prices_data).
          ...(hasSpark
            ? { weeklySparkline: compact, weeklySparklineAt: new Date() }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(pricesCoins.symbol, dbSymbol));
      enriched++;
      if (enrichedSamples.length < 10) {
        enrichedSamples.push(`${dbSymbol}=${winner.id}`);
      }
    } catch {
      errors++;
    }
  }

  return {
    ok: true,
    candidatesLoaded: candidates.length,
    matched,
    enriched,
    noMatch,
    errors,
    imageMirrorFailed,
    enrichedSamples,
  };
}

/** Downsample sparkline 168→21 punti (1 ogni 8h). Identico a
 *  sources/coingecko.ts ma in-lined per non creare dipendenza
 *  bidirezionale tra enrichment e sources. */
function downsampleSparkline(points: number[] | null): number[] | null {
  if (!points || points.length < 2) return null;
  const target = 21;
  const finite = points.filter((n) => Number.isFinite(n));
  if (finite.length <= target) return finite;
  const step = finite.length / target;
  const out: number[] = [];
  for (let i = 1; i <= target; i++) {
    const idx = Math.min(finite.length - 1, Math.floor(i * step) - 1);
    out.push(finite[idx]);
  }
  return out;
}
