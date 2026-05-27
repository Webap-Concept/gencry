// lib/modules/prices/exchanges/types.ts
//
// Contratto comune per ogni "exchange adapter" del modulo prices.
//
// Architettura (PR1 del refactor Redis-first, vedi memoria):
//   - Multi-exchange composabile: ogni coin nella tabella `prices_coins`
//     ha un `preferred_exchange + exchange_symbol`. Il cron group-by-
//     exchange chiama in parallelo `adapter.fetchCurrentPrices` per
//     ciascuno e fa il merge in Redis.
//   - Aggiungere KuCoin / Gate / Kraken / Coinbase = 1 file conforme
//     a `PriceExchangeAdapter` + 1 entry in `registry.ts` + 1 INSERT
//     in `price_exchanges`.
//   - Niente lock-in: niente codice business legato a un exchange
//     specifico.
//
// Le quote ritornate riusano `PriceQuote` di lib/modules/prices/types.ts
// (shape unica condivisa con CoinGecko/DexScreener); i field non
// disponibili sull'exchange (es. marketCap, sparkline7d) sono null.
// Quelli sono recuperati dal layer "slow" CoinGecko (PR successiva).

import type { PriceQuote } from "../types";

/** Id stabili. Per type-safety nei consumer; nuovi exchange si aggiungono
 *  qui + nel `EXCHANGE_REGISTRY`. */
export type ExchangeId =
  | "binance"
  | "kucoin"
  | "gate"
  | "kraken"
  | "coinbase";

export interface ExchangeFetchInput {
  /** Symbol canonico interno (es. "BTC"). */
  symbol: string;
  /** Symbol nel formato dell'exchange (es. "BTCUSDT" per Binance). */
  exchangeSymbol: string;
}

export interface HealthCheckResult {
  ok: boolean;
  latencyMs: number;
  error?: string;
}

export type ChartRange = "1d" | "1w" | "1m" | "3m" | "6m" | "1y";

export interface HistoricalPoint {
  /** Unix ms del bucket close. */
  ts: number;
  /** Close price USD. */
  price: number;
}

/**
 * Contratto che ogni exchange deve implementare.
 *
 * Convenzioni:
 *   - fetchCurrentPrices: batched, 1 chiamata HTTP per N symbols.
 *     Ritorna Map<symbol, PriceQuote> chiavato sul symbol CANONICO
 *     (non sull'exchange_symbol). I symbol non risolti sono omessi.
 *   - fetchHistorical: pure per-symbol. Il caller cache + aggrega.
 *   - healthCheck: probe leggero (ping endpoint pubblico), risposta in
 *     <2s. Usato dal pannello admin services.
 *
 * Tutti i metodi devono essere resilienti agli errori: invece di throw
 * generici, segnalare con un campo `error` ove possibile + ritornare
 * un risultato parziale dove sensato.
 */
export interface PriceExchangeAdapter {
  readonly id: ExchangeId;
  readonly label: string;
  /** Alcuni adapter richiedono credenziali (free non sempre — Coinbase
   *  Advanced Trade API si', Binance public no). */
  readonly needsApiKey: "no" | "optional" | "required";

  fetchCurrentPrices(
    inputs: ExchangeFetchInput[],
  ): Promise<Map<string, PriceQuote>>;

  fetchHistorical(
    exchangeSymbol: string,
    range: ChartRange,
  ): Promise<HistoricalPoint[]>;

  healthCheck(): Promise<HealthCheckResult>;

  /** Opzionale: lista TUTTI gli exchange symbol USD-quoted attivi su
   *  questo exchange (es. "BTCUSDT", "ETHUSDT"...). Usato dall'admin
   *  bulk auto-map per validare quali coin del registry sono
   *  effettivamente listati prima dell'UPDATE. Adapter che non
   *  espongono un equivalente di /exchangeInfo lo omettono. */
  listSupportedUsdSymbols?(): Promise<Set<string>>;
}

/**
 * Errore tipato che un adapter puo' throw: il caller decide se
 * propagare o degradare (es. al CoinGecko fallback).
 */
export class ExchangeAdapterError extends Error {
  constructor(
    public readonly exchangeId: ExchangeId,
    message: string,
    public readonly status?: number,
    public readonly retryable: boolean = true,
  ) {
    super(`[${exchangeId}] ${message}`);
    this.name = "ExchangeAdapterError";
  }
}
