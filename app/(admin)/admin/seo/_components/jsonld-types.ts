/**
 * Costanti JSON-LD in file separato per evitare import circular
 * tra actions.ts ("use server") e seo-manager.tsx ("use client").
 *
 * Next.js 16 con Turbopack può crashare il bundle client se un
 * "use client" component importa direttamente da un "use server" file.
 */

// Tipi JSON-LD esposti nell'admin: solo quelli che possiamo emettere
// validamente con i dati di seo_pages + app_settings + pages.published_at.
//
// Volutamente esclusi (lo schema sarebbe invalido a Google senza dati
// custom che il CMS oggi non gestisce):
//   - BreadcrumbList → richiede itemListElement (gerarchia)
//   - Product        → richiede offers (price/availability)
//   - FAQPage        → richiede mainEntity (Question + acceptedAnswer)
//   - Event          → richiede startDate + location
//   - VideoObject    → richiede uploadDate + thumbnailUrl + contentUrl
//
// Le pagine che vogliono questi tipi (es. /coins/[symbol] con
// BreadcrumbList + FinancialProduct) li emettono via un component
// JSON-LD dedicato, non passano per il selettore admin.
export const JSON_LD_TYPES = [
  "WebPage",
  "Article",
  "BlogPosting",
  "Organization",
  "LocalBusiness",
  "Person",
] as const;

export type JsonLdType = (typeof JSON_LD_TYPES)[number];
