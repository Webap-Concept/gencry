// lib/modules/news/cms-extension.ts
//
// Registrazione dell'extension del CMS page-editor per il modulo News.
// Aggiunge a runtime:
//
//   - un campo custom `category` (select con le 8 categorie hard-coded
//     nel modulo). NON vive in `template_fields` DB perché è
//     module-owned: cambiando l'enum delle categorie nel codice il
//     campo si aggiorna senza migration.
//
//   - uno slug resolver che usa `category` per derivare il prefix URL
//     dell'articolo (`/altcoin/<slug>`, `/bitcoin/<slug>`, ecc.) —
//     stesso mapping usato da `buildNewsSlug` al publish, single
//     source of truth in CATEGORY_URL_PREFIX.
//
// Side-effect import: questo file deve essere caricato al boot del
// server (via `lib/modules/registry.ts`) per popolare il registry
// generico in `lib/cms/page-template-extensions.ts`.

import { registerPageTemplateExtension } from "@/lib/cms/page-template-extensions";
import { NEWS_CATEGORY_URL_PREFIX } from "./url-prefixes";

// Mappa categoria → URL prefix: importata da `./url-prefixes.ts`,
// che è client-safe (zero side-effect server-only). Single source of
// truth condivisa con `publish.ts` e con il validator slug del CMS.
const CATEGORY_PREFIX: Record<string, string> = NEWS_CATEGORY_URL_PREFIX;

const CATEGORY_LABELS: Record<string, string> = {
  bitcoin: "Bitcoin",
  ethereum: "Ethereum",
  altcoin: "Altcoin",
  stablecoin: "Stablecoin",
  defi: "DeFi",
  regulation: "Regulation",
  market: "Market",
  tech: "Tech",
  other: "Other / News",
};

registerPageTemplateExtension({
  templateSlug: "news",
  pageType: "news",
  fields: [
    {
      key: "category",
      type: "select",
      label: "Categoria",
      required: false,
      defaultValue: "other",
      sortOrder: 5,
      options: Object.keys(CATEGORY_PREFIX).map((value) => ({
        value,
        label: CATEGORY_LABELS[value] ?? value,
      })),
    },
  ],
  slugResolver: {
    fieldKey: "category",
    prefixMap: CATEGORY_PREFIX,
    fallback: "news",
  },
});
