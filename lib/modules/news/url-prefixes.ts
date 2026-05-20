// lib/modules/news/url-prefixes.ts
//
// Single source of truth della mappa categoria → URL prefix per il
// modulo news. NIENTE `server-only` qui: è importato sia da
// `publish.ts` (server) che da `cms-extension.ts` (registry runtime,
// client-reachable). Tenere il file privo di side-effect server-only
// (no DB, no env, no fs) altrimenti il client bundle esplode.
//
// Convenzione:
//   - Codici categoria EN (allineati a NEWS_CATEGORIES in categories.ts)
//   - URL prefix mescolati IT/EN secondo readability italiana:
//     `regulation → regolamentazione`, `market → mercati`,
//     `bitcoin/ethereum/defi` restano EN perché usati anche dagli IT.
//   - `other` cade su `news` come fallback (slug listing dell'archivio).
//
// L'URL prefix viene usato:
//   - Per costruire lo slug pubblico di un articolo (`<prefix>/<slug>`)
//   - Come reserved slug dell'admin (impedisce CMS pages "rogue" che
//     colliderebbero con la routing news)
//   - Dal validator slug del page-editor (bypass primo segmento se
//     coincide con uno di questi prefix e il template è "news")
//   - Da `isNewsPathname()` per riconoscere il contesto news anche
//     dentro un articolo (es. /altcoin/foo) → layout full-bleed +
//     logo che punta a /news invece che /

import { NEWS_CATEGORIES, type NewsCategory } from "./categories";

export const NEWS_CATEGORY_URL_PREFIX: Record<NewsCategory, string> = {
  bitcoin: "bitcoin",
  ethereum: "ethereum",
  altcoin: "altcoin",
  stablecoin: "stablecoin",
  defi: "defi",
  regulation: "regolamentazione",
  market: "mercati",
  tech: "tech",
  other: "news",
};

// Verifica di tipo: ogni NEWS_CATEGORIES deve avere una entry. Niente
// runtime check perché lo verifica TS al compile time tramite Record.
void (NEWS_CATEGORIES satisfies readonly NewsCategory[]);

/**
 * Tutti gli URL prefix usati dal modulo news, deduplicati. La duplicazione
 * (Set) non è ottimizzazione: `regulation→regolamentazione`,
 * `market→mercati` ecc. producono prefix unique. `other→news` invece
 * collide con il prefix "news" letterale → il Set lo accorpa.
 */
export function getNewsUrlPrefixes(): readonly string[] {
  return Array.from(new Set(Object.values(NEWS_CATEGORY_URL_PREFIX)));
}

/**
 * Risolve codice → prefix con fallback su "news" (per category
 * nulla / sconosciuta). Esposto come helper invece che inline lookup
 * per evitare divergenza tra publish-time e read-time.
 */
export function newsCategoryUrlPrefix(category: string | null): string {
  if (!category) return "news";
  return (
    (NEWS_CATEGORY_URL_PREFIX as Record<string, string>)[category] ?? "news"
  );
}
