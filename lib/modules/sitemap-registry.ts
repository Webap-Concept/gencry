// lib/modules/sitemap-registry.ts
//
// Aggregator server-only delle sitemap dichiarate dai moduli installati.
// Consumato da:
//   - /admin/seo/sitemap → dashboard con count + lastModified per card.
//   - /robots.txt → righe `Sitemap:` auto-generate sotto le rules.
//
// Per aggiungere un modulo con sitemap:
//   1. Crea `lib/modules/<modulo>/sitemap-manifest.ts` (default export
//      ModuleSitemap, file server-only).
//   2. Crea `lib/modules/<modulo>/sitemap-stats.ts` (default export
//      function async che ritorna count + lastModified).
//   3. Aggiungi l'import qui sotto.
//
// Lo split rispetto a `lib/modules/registry.ts` (manifest principali) è
// necessario perché quello viene importato dalla sidebar admin client,
// e portarsi dietro i sitemap-stats (server-only, DB queries) farebbe
// esplodere il client bundle.
import "server-only";

import type { ModuleSitemap } from "./types";
import postsSitemap from "./posts/sitemap-manifest";
import pricesSitemap from "./prices/sitemap-manifest";

export const MODULE_SITEMAPS: ReadonlyArray<ModuleSitemap> = [
  pricesSitemap,
  postsSitemap,
];
