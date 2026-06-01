// lib/modules/rewards/format.ts — Formattazione compatta dei saldi coin.
// Regola: sotto 1k mostra il numero; 1k-9.9k mostra 1 decimale (1.1k);
// 10k-999k mostra senza decimale (10k); 1M+ con 1 decimale (1.2M); 10M+ senza.

export function formatCoins(n: number): string {
  // it-IT: separatore decimale virgola, coerente col saldo grande (toLocaleString).
  // numeric(10,2) → max 2 decimali, niente artefatti float.
  if (n < 1_000) return n.toLocaleString("it-IT", { maximumFractionDigits: 2 });
  if (n < 10_000) {
    const fixed = (n / 1_000).toFixed(1);
    return fixed.endsWith(".0") ? `${fixed.slice(0, -2)}k` : `${fixed}k`;
  }
  if (n < 1_000_000) return `${Math.floor(n / 1_000)}k`;
  if (n < 10_000_000) {
    const fixed = (n / 1_000_000).toFixed(1);
    return fixed.endsWith(".0") ? `${fixed.slice(0, -2)}M` : `${fixed}M`;
  }
  return `${Math.floor(n / 1_000_000)}M`;
}
