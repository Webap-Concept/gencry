// lib/modules/prices/sitemap-manifest.ts
//
// Dichiarazione sitemap del modulo prices. SEPARATO dal manifest
// principale (lib/modules/prices/manifest.ts) perché:
//   - il manifest principale è importato anche da client component
//     (es. admin sidebar nav), che attiva la registry runtime.
//   - questo file invece è server-only: lo carica solo l'admin dashboard
//     /admin/seo/sitemap + il route handler /robots.txt.
// Questo split evita che `loadStats: () => import("./sitemap-stats")`
// statico-pulli `sitemap-stats.ts` (server-only, db queries) nel client
// bundle del modulo, che esploderebbe il build.
import "server-only";

import type { ModuleSitemap } from "@/lib/modules/types";

const sitemap: ModuleSitemap = {
  url: "/coins/sitemap.xml",
  label: "Coin pages",
  loadStats: () => import("./sitemap-stats"),
};

export default sitemap;
