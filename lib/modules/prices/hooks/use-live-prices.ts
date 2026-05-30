"use client";
// lib/modules/prices/hooks/use-live-prices.ts
//
// Hook React per i prezzi live via SSE (Upstash Realtime).
//
// Usage:
//   // 1. Wrappa il componente con PricesRealtimeProvider (se enabled)
//   // 2. Usa il hook dentro il componente
//
//   const prices = useLivePrices({
//     enabled: livePricesEnabled,
//     initial: { BTC: 67000, ETH: 3200 }, // da ISR/RSC
//   });
//   // prices.BTC → aggiornato in-place senza refresh pagina
//
// Quando enabled=false, ritorna `initial` senza aprire nessuna connessione.
//
// PricesRealtimeProvider va inserito in un layout/page client sopra i
// componenti che usano useLivePrices. Passa api.url="/api/realtime/prices".
//
// TODO (follow-up): wire nelle CoinCard del feed e nella prices page.

import { useState, useCallback } from "react";
import { useRealtime } from "@upstash/realtime/client";
import type { LivePricesPayload } from "../services/live-prices-emitter";

export type LivePricesMap = Record<string, number>;

interface UseLivePricesOpts {
  /** Se false il hook è no-op e ritorna `initial` invariato. */
  enabled: boolean;
  /** Prezzi iniziali da ISR/RSC (snapshot statico). */
  initial: LivePricesMap;
}

/**
 * Ritorna una map symbol→price aggiornata in real-time via SSE.
 * Merge incrementale: solo i coin ricevuti nell'evento vengono aggiornati;
 * quelli non nell'evento mantengono l'ultimo valore noto.
 */
export function useLivePrices({ enabled, initial }: UseLivePricesOpts): LivePricesMap {
  const [prices, setPrices] = useState<LivePricesMap>(initial);

  const onData = useCallback((msg: { event: string; data: unknown; channel: string }) => {
    if (msg.event !== "update") return;
    const payload = msg.data as LivePricesPayload;
    if (!payload?.quotes) return;
    setPrices((prev) => {
      const next = { ...prev };
      for (const [sym, q] of Object.entries(payload.quotes)) {
        if (typeof q.price === "number" && Number.isFinite(q.price)) {
          next[sym] = q.price;
        }
      }
      return next;
    });
  }, []);

  // Nessun type arg esplicito: TypeScript inferisce T=Record<string,any>
  // e E="update" dai literal. onData casta il payload via LivePricesPayload.
  useRealtime({
    channels: ["prices"] as const,
    events:   ["update"] as const,
    enabled,
    onData,
  });

  return prices;
}
