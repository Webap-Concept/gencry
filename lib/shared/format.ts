// Formatter per prezzi crypto e variazioni percentuali, riusati ovunque
// (feed, esplora, watchlist, dettaglio coin).

/**
 * Formatta un prezzo USD con un numero di decimali sensato in base alla scala:
 * memecoin (<0.01) → 8 decimali; sub-dollaro → 4; mid → 2; large cap → con separatori migliaia.
 */
export function fmtPrice(price: number): string {
  if (price < 0.01) return price.toFixed(8);
  if (price < 1) return price.toFixed(4);
  if (price < 100) return price.toFixed(2);
  return price.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

/**
 * Formatta una variazione % 24h con segno esplicito ("+1.8%" / "-3.1%").
 */
export function fmtChange(change: number): string {
  const sign = change >= 0 ? "+" : "";
  return `${sign}${change.toFixed(1)}%`;
}
