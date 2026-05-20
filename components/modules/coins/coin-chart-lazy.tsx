"use client";

// components/modules/coins/coin-chart-lazy.tsx
//
// Wrapper client che lazy-carica `CoinChart` via `next/dynamic`. Serve
// per togliere Recharts (+lodash transitive ~100KB gzip) dal first
// load di `/coins/[symbol]/page.tsx` — il chart è below the fold
// nella maggior parte dei viewport, non vale eager-load.
//
// `ssr: false` è ammesso qui perché siamo in un Client Component
// (la stessa cosa NON funziona se messa direttamente in un Server
// Component, vincolo Next 16). Il loading state mostra uno scheletro
// con la stessa altezza approssimativa del chart per evitare CLS.

import dynamic from "next/dynamic";
import type { HistorySeries } from "@/lib/modules/prices/queries";

const CoinChart = dynamic(
  () => import("./coin-chart").then((m) => m.CoinChart),
  {
    ssr: false,
    loading: () => (
      <div
        className="w-full rounded-lg animate-pulse"
        style={{
          height: 320,
          background: "color-mix(in srgb, var(--gc-fg) 4%, transparent)",
        }}
        aria-hidden
      />
    ),
  },
);

export function CoinChartLazy({
  symbol,
  initialSeries,
}: {
  symbol: string;
  initialSeries: HistorySeries;
}) {
  return <CoinChart symbol={symbol} initialSeries={initialSeries} />;
}
