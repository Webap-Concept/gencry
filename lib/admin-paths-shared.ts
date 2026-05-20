// lib/admin-paths-shared.ts
//
// Helpers admin-path UTILIZZABILI ANCHE LATO CLIENT — niente server-only,
// niente DB. Spostati qui da `lib/admin-paths.ts` che invece tocca Drizzle
// e quindi può essere importato solo da Server Components / Route Handlers.
//
// I client (es. <AdminSlugProvider>, page-editor.tsx, ecc.) importano da
// QUESTO file. I server importano da `lib/admin-paths.ts` (che re-exporta
// queste costanti per comodità).

/** Default hardcoded usato come fallback se il setting non è ancora scritto
 *  in DB (es. pre-migration 0037 o tabella vuota). */
export const DEFAULT_ADMIN_URL_SLUG = "admin";

/**
 * Lista dei segmenti URL che NON possono essere usati come admin slug perché
 * collidono con route di sistema o pattern Next interni. La validazione UI
 * controlla anche contro la tabella `pages` (server-side) per evitare
 * collisioni dinamiche con CMS pages create dall'admin.
 *
 * NB: post refactor news-categories-as-cms-pages (mag 2026), i prefix
 * delle categorie news vivono SOTTO `news/...` (es. `news/bitcoin`) e
 * non occupano più i segmenti top-level. Basta riservare `news` come
 * top-level — l'UNIQUE su `pages.slug` protegge i sub-segmenti.
 */
export const ADMIN_RESERVED_SLUGS: readonly string[] = [
  // Next internals
  "_next",
  "api",
  // Auth flows
  "sign-in",
  "sign-up",
  "verify-email",
  "verify-device",
  "forgot-password",
  "reset-password",
  "staff-invite",
  "onboarding",
  "unauthorized",
  // Frontend reserved (gencry)
  "settings",
  "profile",
  "notifiche",
  "explore",
  "coins",
  "libreria",
  "feed",
  "news",
  // Static files served as routes
  "humans.txt",
  "robots.txt",
  "sitemap.xml",
  "favicon.ico",
  "manifest.json",
  // i18n locale prefixes
  "it",
  "en",
  // Common reservati per evitare confusione
  "admin-sign-in",
  "preview",
  "404",
  "500",
];

const ADMIN_SLUG_REGEX = /^[a-z0-9][a-z0-9_-]{1,39}$/;

export type ValidateAdminSlugResult =
  | { ok: true; slug: string }
  | { ok: false; reason: "format" | "reserved" | "collision"; detail?: string };

/**
 * Valida un candidato slug. NON controlla la collisione con `pages` —
 * quella è async e va fatta lato server action col DB. Qui solo regex
 * + reserved list.
 */
export function validateAdminSlugSync(
  candidate: string,
): ValidateAdminSlugResult {
  const trimmed = candidate.trim().toLowerCase();
  if (!ADMIN_SLUG_REGEX.test(trimmed)) {
    return {
      ok: false,
      reason: "format",
      detail: "Lowercase, 2-40 caratteri, [a-z0-9_-], primo char alfanumerico.",
    };
  }
  if (ADMIN_RESERVED_SLUGS.includes(trimmed)) {
    return {
      ok: false,
      reason: "reserved",
      detail: `"${trimmed}" è un segmento riservato.`,
    };
  }
  return { ok: true, slug: trimmed };
}

/** Costruisce un path admin assoluto a partire da slug + sottopath relativo.
 *  Sync, usabile sia client che server. */
export function buildAdminPathFromSlug(
  slug: string,
  relativePath: string,
): string {
  const cleaned = relativePath.replace(/^\/+/, "").replace(/\/+$/, "");
  return cleaned === "" ? `/${slug}` : `/${slug}/${cleaned}`;
}
