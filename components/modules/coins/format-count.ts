// components/modules/coins/format-count.ts
// Formattazione compatta del numero di watchlist mostrato nelle card.
// (Ex `mock-watchlist.ts`: il mockup deterministico è stato rimosso quando
//  il counter reale batch `getWatchlistCountsForSymbols` è arrivato.)

/** Formatta `1234` → `1.2k`, `15800` → `16k`, `99` → `99`. */
export function formatCompactCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k`;
  return `${Math.round(n / 1000)}k`;
}
