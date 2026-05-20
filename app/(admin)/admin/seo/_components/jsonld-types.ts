/**
 * Costanti JSON-LD in file separato per evitare import circular
 * tra actions.ts ("use server") e seo-manager.tsx ("use client").
 *
 * Next.js 16 con Turbopack può crashare il bundle client se un
 * "use client" component importa direttamente da un "use server" file.
 */

// BreadcrumbList volutamente rimosso dalla lista admin: lo schema
// è invalido senza `itemListElement` (lista degli item con position/name/item),
// che non possiamo derivare staticamente dal record seo_pages — richiede
// di conoscere la gerarchia della page CMS o di passare per un component
// dedicato (es. CoinJsonLd in /coins/[symbol]/page.tsx). Lasciarlo come
// opzione UI portava ad emettere JSON-LD invalido a Google.
export const JSON_LD_TYPES = [
  "WebPage",
  "Article",
  "BlogPosting",
  "Product",
  "FAQPage",
  "Organization",
  "LocalBusiness",
  "Person",
  "Event",
  "VideoObject",
] as const;

export type JsonLdType = (typeof JSON_LD_TYPES)[number];
