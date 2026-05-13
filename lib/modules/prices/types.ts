// lib/prices/types.ts
// Shape comune restituita dalle source API (CoinGecko, DexScreener) prima
// dell'upsert nel DB. La normalizzazione avviene negli adapter.

export interface PriceQuote {
  symbol: string;       // ticker upper-case, es. "BTC"
  price: number;        // USD
  change24h: number | null;
  volume24h: number | null;
  /** Sparkline 7gg downsampled a 21 punti (3 al giorno, oldest→newest).
   *  Null se la source non la fornisce (es. DexScreener). */
  sparkline7d: number[] | null;
  /** Market cap USD. Null se la source non lo fornisce. */
  marketCap: number | null;
  /** Posizione globale per market cap (1 = top). Null se la source non lo
   *  fornisce (DexScreener). Aggiornato su `prices_coins` dal sync. */
  marketCapRank: number | null;
}

export interface CoinMetadata {
  symbol: string;
  coingeckoId?: string;
  name: string;
  imageUrl?: string;
  marketCap?: number;
  category?: string;
}

export type SourceName = "coingecko" | "dexscreener";

export interface SourceFetchResult {
  source: SourceName;
  quotes: Map<string, PriceQuote>;  // chiave = symbol upper-case
  latencyMs: number;
}
