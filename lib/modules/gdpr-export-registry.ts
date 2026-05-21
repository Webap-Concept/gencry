// lib/modules/gdpr-export-registry.ts
//
// Aggregator server-only delle hook GDPR esposte dai moduli installati.
// Consumato da `lib/account/gdpr-export.ts` quando il cron worker
// raccoglie i dati personali dell'utente da serializzare nel JSON.
//
// Per aggiungere un modulo con dati personali GDPR:
//   1. Crea `lib/modules/<modulo>/gdpr-export.ts` (default export:
//      `(userId: string) => Promise<unknown>`, file server-only).
//   2. Aggiungi l'import qui sotto.
//
// Lo split rispetto a `lib/modules/registry.ts` (manifest principali) è
// necessario perché quello viene importato dalla sidebar admin client,
// e portarsi dietro i collector GDPR (server-only, drizzle queries) lo
// farebbe esplodere il client bundle. Stesso razionale del
// sitemap-registry.ts.
import "server-only";

import type { ModuleGdprExport } from "./types";

export const MODULE_GDPR_EXPORTS: ReadonlyArray<ModuleGdprExport> = [
  {
    key: "posts",
    loadCollector: () => import("./posts/gdpr-export"),
  },
];
