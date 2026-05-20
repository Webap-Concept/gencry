// lib/modules/news/url-prefixes.ts
//
// Mappa categoria → URL prefix per il modulo news. NIENTE `server-only`:
// il file è puro (no DB, no env, no fs) e potrebbe finire in qualunque
// bundle senza side-effect.
//
// Convenzione:
//   - Codici categoria EN (allineati a NEWS_CATEGORIES in categories.ts)
//   - URL prefix mescolati IT/EN secondo readability italiana:
//     `regulation → regolamentazione`, `market → mercati`,
//     `bitcoin/ethereum/defi` restano EN perché usati anche dagli IT.
//   - `other` cade su `news` come fallback (l'articolo finisce figlio
//     diretto di /news, non sotto una categoria).
//
// Post refactor news-categories-as-cms-pages (mag 2026), il mapping
// serve SOLO al publisher (publish.ts) per risolvere
// `news_items.category` → slug della page categoria CMS (`news/<prefix>`)
// alla quale agganciare il nuovo articolo. La fonte autoritativa per
// l'URL pubblico è `pages.slug`, non più questa mappa.

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
