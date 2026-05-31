// lib/modules/prices/exchanges/registry.ts
//
// Registry centrale degli exchange adapter disponibili.
//
// Per aggiungere un nuovo exchange:
//   1. Crea `lib/modules/prices/exchanges/<id>.ts` con un export conforme
//      a `PriceExchangeAdapter`.
//   2. Aggiungilo a `EXCHANGE_REGISTRY` qui sotto + estendi `ExchangeId`
//      in `types.ts`.
//   3. INSERT in `price_exchanges` (id, label, enabled=true) — via
//      migration o admin UI quando arrivera'.
//
// Il consumer (cron + chart API) chiede al registry per id. Niente
// import diretto dell'adapter Binance dal cron: tutto passa per qui.

import "server-only";
import { binanceAdapter } from "./binance";
import { kucoinAdapter } from "./kucoin";
import { gateAdapter } from "./gate";
import type { ExchangeId, PriceExchangeAdapter } from "./types";

/** Mapping id → adapter. Source of truth per i consumer. */
export const EXCHANGE_REGISTRY: Record<ExchangeId, PriceExchangeAdapter> = {
  binance: binanceAdapter,
  kucoin: kucoinAdapter,
  gate: gateAdapter,
  // Aggiunte future:
  //   kraken:   krakenAdapter,
  //   coinbase: coinbaseAdapter,
} as Partial<Record<ExchangeId, PriceExchangeAdapter>> as Record<
  ExchangeId,
  PriceExchangeAdapter
>;

/** Type-narrow helper: ritorna l'adapter se esiste, null altrimenti. */
export function getExchangeAdapter(
  id: string | null | undefined,
): PriceExchangeAdapter | null {
  if (!id) return null;
  const adapter = (EXCHANGE_REGISTRY as Record<string, PriceExchangeAdapter>)[id];
  return adapter ?? null;
}

/** Lista degli id implementati in codice. La tabella `price_exchanges`
 *  puo' avere record che NON sono qui (es. exchange disabilitato +
 *  adapter non scritto ancora): il caller filtra via getExchangeAdapter. */
export function listImplementedExchangeIds(): ExchangeId[] {
  return Object.keys(EXCHANGE_REGISTRY) as ExchangeId[];
}
