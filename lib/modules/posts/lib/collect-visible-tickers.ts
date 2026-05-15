// lib/modules/posts/lib/collect-visible-tickers.ts
//
// Helper server-side: dato un array di PostCardData, ritorna l'insieme
// dei symbol unici menzionati (sia dal post principale che dai
// quote-repost embed). Usato dai Server Components per prefetchare il
// TickerHoverCard batch (zero round-trip lato client per ticker già
// visibili).
import type { PostCardData } from "../types";

export function collectVisibleTickers(posts: PostCardData[]): string[] {
  const out = new Set<string>();
  for (const p of posts) {
    for (const t of p.tickers) out.add(t);
    if (p.repostOf) {
      for (const t of p.repostOf.tickers) out.add(t);
    }
  }
  return Array.from(out);
}
