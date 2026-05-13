// components/modules/coins/mock-watchlist.ts
// Mockup deterministico del numero di watchlist in cui appare un coin.
// La feature "watchlist" non esiste ancora — quando esisterà la query
// reale sostituirà questa funzione SENZA toccare il rendering della card.
//
// Range scelto: 100–20000. Hash 32-bit del symbol → modulo range. Lo
// stesso symbol produce sempre lo stesso valore (stabile tra reload),
// così la UI non sembra "nervosa".

function hash32(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  // `>>> 0` converte a unsigned 32-bit: evita l'edge-case di Math.abs(MIN_INT)
  return h >>> 0;
}

const MIN = 100;
const MAX = 20_000;

export function mockWatchlistCount(symbol: string): number {
  return MIN + (hash32(symbol.toUpperCase()) % (MAX - MIN));
}

/** Formatta `1234` → `1.2k`, `15800` → `15.8k`, `99` → `99`. */
export function formatCompactCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k`;
  return `${Math.round(n / 1000)}k`;
}
