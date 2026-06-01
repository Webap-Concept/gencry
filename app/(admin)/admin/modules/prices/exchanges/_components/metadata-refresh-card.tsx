"use client";
// app/(admin)/admin/modules/prices/exchanges/_components/metadata-refresh-card.tsx
//
// "Refresh metadata now" — trigger manuale del cron
// `modules-prices-metadata-refresh` (gira ogni 4h via QStash).
//
// Differenza vs Enrichment:
//   - Enrichment: prima volta, popola coingecko_id+name+image+marketCap
//                 per coin con coingecko_id IS NULL.
//   - Refresh:    re-fetch periodico di marketCap+rank+sparkline per
//                 coin con coingecko_id IS NOT NULL (le immagini su R2
//                 sono immutabili → non si toccano).
//
// Esiste perche' i coin routati su Binance/KuCoin ricevono live price
// dall'exchange (che non espone market_cap), quindi senza questo refresh
// market_cap resterebbe fermo all'ultimo enrichment.

import { AdminButton } from "@/app/(admin)/admin/_components/admin-button";
import { Loader2, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  refreshMetadataNowAction,
  type MetadataRefreshActionResult,
} from "../actions";

export function MetadataRefreshCard({
  refreshableCount,
}: {
  /** Numero di coin attivi con coingecko_id (target del refresh). */
  refreshableCount: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<MetadataRefreshActionResult | null>(null);

  function run() {
    setResult(null);
    startTransition(async () => {
      const res = await refreshMetadataNowAction();
      setResult(res);
      router.refresh();
    });
  }

  return (
    <section
      className="rounded-xl p-5 space-y-3"
      style={{
        background: "var(--admin-card-bg)",
        border: "1px solid var(--admin-card-border)",
      }}>
      <header className="flex items-start gap-3">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
          style={{
            background:
              "color-mix(in srgb, var(--admin-accent) 12%, transparent)",
            color: "var(--admin-accent)",
          }}>
          <RefreshCw size={16} strokeWidth={1.75} />
        </div>
        <div className="flex-1 min-w-0">
          <h3
            className="text-sm font-semibold"
            style={{ color: "var(--admin-text)" }}>
            Refresh metadata (market cap + sparkline)
          </h3>
          <p
            className="text-[12px] mt-0.5"
            style={{ color: "var(--admin-text-faint)" }}>
            Re-fetch periodico da CoinGecko di{" "}
            <strong>market cap</strong>, <strong>rank</strong> e{" "}
            <strong>sparkline 7d</strong> per i coin con coingecko_id (anche
            quelli routati su exchange). Gira automaticamente ogni 4h via
            QStash; questo bottone forza un run subito.
          </p>
          <p
            className="text-[12px] mt-1.5"
            style={{ color: "var(--admin-text-muted)" }}>
            Coin coperti dal refresh:{" "}
            <strong style={{ color: "var(--admin-accent)" }}>
              {refreshableCount}
            </strong>
          </p>
        </div>
        <AdminButton
          variant="secondary"
          size="md"
          icon={pending ? Loader2 : RefreshCw}
          onClick={run}
          disabled={pending || refreshableCount === 0}>
          {pending ? "Refreshing…" : "Refresh now"}
        </AdminButton>
      </header>

      {result && <ResultPanel result={result} />}
    </section>
  );
}

function ResultPanel({ result }: { result: MetadataRefreshActionResult }) {
  if (!result.ok) {
    return (
      <div
        className="rounded-lg p-3 text-[12.5px]"
        style={{
          background:
            "color-mix(in srgb, var(--gc-neg, #dc2626) 10%, transparent)",
          color: "var(--gc-neg, #dc2626)",
          border:
            "1px solid color-mix(in srgb, var(--gc-neg, #dc2626) 30%, transparent)",
        }}>
        Errore: {result.error}
      </div>
    );
  }
  return (
    <div
      className="rounded-lg p-3 text-[12.5px] space-y-1"
      style={{
        background:
          "color-mix(in srgb, var(--gc-pos, #10b981) 8%, transparent)",
        border:
          "1px solid color-mix(in srgb, var(--gc-pos, #10b981) 30%, transparent)",
        color: "var(--admin-text-muted)",
      }}>
      <p>
        Coin caricati: <strong>{result.coinsLoaded}</strong> · Batch
        CoinGecko: <strong>{result.batchesFetched}</strong> · Durata:{" "}
        <strong>{result.durationMs} ms</strong>
      </p>
      <p>
        Aggiornati market cap+rank:{" "}
        <strong style={{ color: "var(--gc-pos, #10b981)" }}>
          {result.updatedMarketCap}
        </strong>{" "}
        · Sparkline:{" "}
        <strong style={{ color: "var(--gc-pos, #10b981)" }}>
          {result.updatedSparkline}
        </strong>
        {result.errors > 0 && (
          <>
            {" "}
            · Errori:{" "}
            <strong style={{ color: "var(--gc-neg, #dc2626)" }}>
              {result.errors}
            </strong>
          </>
        )}
      </p>
    </div>
  );
}
