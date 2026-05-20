// lib/modules/news/categories.ts
// Client-safe enum delle categorie news. NON aggiungere "server-only" qui:
// è importato dal review editor (client component) per popolare il dropdown.
// La rewriter.ts (server-only, importa @anthropic-ai/sdk) ri-esporta da qui.

export const NEWS_CATEGORIES = [
  "bitcoin",
  "ethereum",
  "altcoin",
  "stablecoin",
  "defi",
  "regulation",
  "market",
  "tech",
  "other",
] as const;

export type NewsCategory = (typeof NEWS_CATEGORIES)[number];
