// lib/modules/posts/sitemap-manifest.ts
//
// Dichiarazione sitemap del modulo posts. Vedi il commento del file
// gemello `lib/modules/prices/sitemap-manifest.ts` per il razionale
// dello split rispetto al manifest principale del modulo.
import "server-only";

import type { ModuleSitemap } from "@/lib/modules/types";

const sitemap: ModuleSitemap = {
  url: "/post/sitemap.xml",
  label: "Posts",
  loadStats: () => import("./sitemap-stats"),
};

export default sitemap;
