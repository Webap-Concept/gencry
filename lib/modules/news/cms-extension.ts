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

// Stesso mapping di lib/modules/news/publish.ts. Duplicato qui per
// evitare di trascinare `publish.ts` (server-only) dentro un import
// chain raggiungibile dal client bundle.
const CATEGORY_PREFIX: Record<string, string> = {
  bitcoin: "bitcoin",
  ethereum: "ethereum",
  altcoin: "altcoin",
  defi: "defi",
  regulation: "regolamentazione",
  market: "mercati",
  tech: "tech",
  other: "news",
};

const CATEGORY_LABELS: Record<string, string> = {
  bitcoin: "Bitcoin",
  ethereum: "Ethereum",
  altcoin: "Altcoin",
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
