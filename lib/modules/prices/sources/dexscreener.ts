// lib/prices/sources/dexscreener.ts
// Adapter DexScreener (fallback). Endpoint pubblico, no auth.
// Limit 300 req/min consigliato. Per cercare per simbolo usiamo /search,
// che restituisce le pair ordinate per liquidità: prendiamo la prima.
import type { PriceQuote, SourceFetchResult } from "../types";

const DEX_BASE = "https://api.dexscreener.com/latest/dex";
const TIMEOUT_MS = 10_000;
// Concorrenza limitata per non saturare il fallback (è un fallback, non
// un'autostrada): max 5 simboli in volo contemporaneamente.
const CONCURRENCY = 5;

interface DexPair {
  baseToken: { symbol: string };
  priceUsd?: string;
  priceChange?: { h24?: number };
  volume?: { h24?: number };
  liquidity?: { usd?: number };
}

interface DexSearchResponse {
  pairs?: DexPair[] | null;
}

export class DexScreenerError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "DexScreenerError";
  }
}

async function fetchSingle(symbol: string): Promise<PriceQuote | null> {
  const url = `${DEX_BASE}/search?q=${encodeURIComponent(symbol)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });
    if (res.status === 429) throw new DexScreenerError("DexScreener 429", 429);
    if (!res.ok) return null;

    const data = (await res.json()) as DexSearchResponse;
    const pairs = data.pairs ?? [];
    // Filtro per simbolo esatto (la search è permissiva e ritorna anche match parziali).
    const exact = pairs.filter((p) => p.baseToken.symbol.toUpperCase() === symbol.toUpperCase());
    if (exact.length === 0) return null;
    // Ordina per liquidità decrescente, prendi la migliore
    exact.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
    const best = exact[0];
    const price = best.priceUsd ? Number(best.priceUsd) : NaN;
    if (!Number.isFinite(price)) return null;

    return {
      symbol: symbol.toUpperCase(),
      price,
      change24h: typeof best.priceChange?.h24 === "number" ? best.priceChange.h24 : null,
      volume24h: typeof best.volume?.h24 === "number" ? best.volume.h24 : null,
      sparkline7d: null,
    };
  } catch (err) {
    if (err instanceof DexScreenerError) throw err;
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchDexScreenerPrices(symbols: string[]): Promise<SourceFetchResult> {
  const start = Date.now();
  const quotes = new Map<string, PriceQuote>();
  if (symbols.length === 0) {
    return { source: "dexscreener", quotes, latencyMs: 0 };
  }

  // Pool di concorrenza: avanza in finestre da CONCURRENCY simboli
  const queue = [...symbols];
  let firstError: DexScreenerError | null = null;

  async function worker(): Promise<void> {
    while (queue.length > 0) {
      const sym = queue.shift();
      if (!sym) return;
      try {
        const quote = await fetchSingle(sym);
        if (quote) quotes.set(quote.symbol, quote);
      } catch (err) {
        if (err instanceof DexScreenerError && !firstError) {
          firstError = err;
        }
        // Errori sui singoli simboli non interrompono il batch, ma se nessun
        // simbolo è stato risolto e l'unico errore è stato un 429, lo propaghiamo
        // per attivare il circuit breaker.
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, symbols.length) }, worker));

  // Se non abbiamo recuperato nessun prezzo e abbiamo visto un 429, propaga l'errore.
  if (quotes.size === 0 && firstError) {
    throw firstError;
  }

  return { source: "dexscreener", quotes, latencyMs: Date.now() - start };
}
