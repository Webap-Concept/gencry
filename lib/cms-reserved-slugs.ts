// lib/cms-reserved-slugs.ts
//
// Validazione degli slug delle pagine CMS contro la lista delle rotte
// "riservate" del sistema. Un admin che crea una pagina CMS NON deve
// poter scegliere uno slug che collide con:
//
//   1. Path di sistema hardcoded (auth, api, _next, ecc. — la lista
//      ADMIN_RESERVED_SLUGS in lib/admin-paths-shared.ts).
//   2. Lo slug admin URL configurato runtime (default "admin", oppure
//      "admincontrol" / qualsiasi altro valore che l'admin abbia
//      scelto da Security → Admin URL).
//   3. Estensione di file static servite via route handler
//      (humans.txt, robots.txt, sitemap.xml — coperti da
//      ADMIN_RESERVED_SLUGS).
//
// Helper sync, no DB. Sicuro per Client Component (per validazione
// live nel page editor). I caller server completano poi col check
// di unicità su `pages.slug` via constraint UNIQUE del DB.

import { ADMIN_RESERVED_SLUGS } from "@/lib/admin-paths-shared";

export type CmsSlugValidationResult =
  | { ok: true; slug: string }
  | {
      ok: false;
      reason: "format" | "reserved" | "first-segment-reserved";
      detail?: string;
      conflictingSegment?: string;
    };

/**
 * Lista completa dei segmenti URL non utilizzabili come slug di pagina
 * CMS. Combina la lista hardcoded admin-reserved con lo slug admin
 * runtime corrente (passato dal caller, perché può essere cambiato
 * dalla UI in Security → Admin URL).
 */
export function getReservedCmsSlugs(adminUrlSlug: string): readonly string[] {
  // Set per dedupe: se adminUrlSlug è il default "admin" e quindi è già
  // sostituito da admin runtime (non più nella lista statica), niente di
  // duplicato; ma di solito ADMIN_RESERVED_SLUGS contiene "admin-sign-in"
  // ecc. Non serve un dedupe stretto.
  const all = new Set<string>(ADMIN_RESERVED_SLUGS);
  if (adminUrlSlug && adminUrlSlug.trim()) {
    all.add(adminUrlSlug.trim().toLowerCase());
  }
  return Array.from(all);
}

const SLUG_FORMAT_REGEX = /^[a-z0-9]+(?:[/-][a-z0-9]+)*$/;

/**
 * Valida lo slug di una pagina CMS:
 *   1. Formato: lowercase, cifre, dash, slash (es. "chi-siamo", "blog/posts").
 *   2. Non riservato (lista getReservedCmsSlugs).
 *   3. Per slug nested (con "/"), il PRIMO segmento non può essere
 *      riservato. Es. con adminUrlSlug = "admincontrol":
 *        - "admincontrol/foo" → reject (collide col rewrite admin)
 *        - "blog/admincontrol" → ok (admincontrol è solo terzo livello)
 *      La logica del proxy.ts riscrive `/<adminSlug>/...` → `/admin/...`,
 *      quindi solo il PRIMO segmento collide col routing.
 *   4. Slug "admin" è sempre riservato (è il path filesystem fisso del
 *      pannello admin), incluso quando l'admin URL slug è stato
 *      rinominato — il proxy.ts comunque rifiuta `/admin/*` quando lo
 *      slug runtime è diverso.
 *
 * `allowedFirstSegments` (opt) = whitelist da bypassare il check del primo
 * segmento. Usato quando un modulo dichiara di "possedere" un prefix
 * via `PageTemplateExtension.slugResolver.prefixMap`. La whitelist NON
 * sblocca il match esatto sul prefix da solo (resta riservato per
 * evitare collisioni con la landing del prefix stesso). Nessun modulo
 * registra slugResolver al momento — la whitelist è quindi sempre
 * vuota, ma la feature resta in piedi per moduli futuri.
 *
 * NB: NON verifica unicità contro `pages.slug` — quello è un check DB
 * a parte, gestito dal server action via UNIQUE constraint.
 */
export function validateCmsSlug(
  slug: string,
  adminUrlSlug: string,
  allowedFirstSegments?: readonly string[],
): CmsSlugValidationResult {
  const trimmed = slug.trim().toLowerCase();
  if (trimmed === "" || !SLUG_FORMAT_REGEX.test(trimmed)) {
    return {
      ok: false,
      reason: "format",
      detail: "Lowercase, cifre, dash. Slash ammesso per slug nested (es. blog/posts).",
    };
  }

  const reserved = new Set(getReservedCmsSlugs(adminUrlSlug));
  // "admin" è sempre riservato (è la cartella filesystem del pannello
  // admin, anche quando lo slug pubblico runtime è stato rinominato).
  reserved.add("admin");

  // Match esatto sull'intero slug
  if (reserved.has(trimmed)) {
    return {
      ok: false,
      reason: "reserved",
      detail: `"${trimmed}" è un percorso riservato del sistema.`,
    };
  }

  // Match sul primo segmento di slug nested (es. "admincontrol/foo").
  // Bypass se il primo segmento è nella whitelist dichiarata dal caller
  // (tipicamente derivata da `PageTemplateExtension.slugResolver.prefixMap`).
  const firstSegment = trimmed.split("/")[0];
  const whitelisted = !!allowedFirstSegments?.includes(firstSegment);
  if (
    firstSegment !== trimmed &&
    reserved.has(firstSegment) &&
    !whitelisted
  ) {
    return {
      ok: false,
      reason: "first-segment-reserved",
      detail: `Il primo segmento "${firstSegment}" è un percorso riservato.`,
      conflictingSegment: firstSegment,
    };
  }

  return { ok: true, slug: trimmed };
}
