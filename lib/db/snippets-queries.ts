// lib/db/snippets-queries.ts
import type { CookieConsentPrefs } from "@/lib/cookie-consent/cookie";
import { db } from "@/lib/db/drizzle";
import { siteSnippets } from "@/lib/db/schema";
import type { SiteSnippet, SnippetPosition } from "@/lib/db/schema";
import { asc, eq } from "drizzle-orm";
import { unstable_cache } from "next/cache";

/** Tutti gli snippet attivi, ordinati per sortOrder. Cache 1h, tag 'snippets'. */
export const getActiveSnippets = unstable_cache(
  async (): Promise<SiteSnippet[]> => {
    return db
      .select()
      .from(siteSnippets)
      .where(eq(siteSnippets.isActive, true))
      .orderBy(asc(siteSnippets.sortOrder));
  },
  ["active-snippets"],
  { revalidate: 3600, tags: ["snippets"] },
);

/** Tutti gli snippet (admin) senza cache. */
export async function getAllSnippets(): Promise<SiteSnippet[]> {
  return db
    .select()
    .from(siteSnippets)
    .orderBy(asc(siteSnippets.sortOrder));
}

/** Snippet attivi filtrati per posizione. */
export async function getActiveSnippetsByPosition(
  position: SnippetPosition,
): Promise<SiteSnippet[]> {
  const all = await getActiveSnippets();
  return all.filter((s) => s.position === position);
}

/**
 * Mappa categoryId → flag di consenso corrispondente. Le 4 categorie
 * ePrivacy hanno mapping fisso. Le categorie custom future cadono sul
 * fallback "preferences" (la più conservativa: opt-in non-tecnico).
 */
const CATEGORY_TO_PREF_KEY: Record<
  string,
  keyof CookieConsentPrefs
> = {
  cookie_necessary: "necessary",
  cookie_preferences: "preferences",
  cookie_analytics: "analytics",
  cookie_marketing: "marketing",
};

/**
 * Filtra una lista di snippet in base al consenso attuale.
 *
 * Regole:
 * - snippet con `cookieServiceId === null` → sempre caricato (always-on).
 *   Questo è il comportamento legacy: snippet senza link cookie continuano
 *   a funzionare come prima del refactor.
 * - snippet con `cookieServiceId` valorizzato → caricato solo se l'utente
 *   ha consentito alla categoria del servizio collegato.
 * - se il banner cookie è disabilitato (`bannerEnabled=false`), gli
 *   snippet collegati a categorie non-necessary NON vengono caricati:
 *   senza banner non c'è una base legale per il tracking opt-in.
 *   Vedi anche `analyticsAllowed` in app/layout.tsx — stessa logica.
 * - se il servizio collegato è stato cancellato (FK SET NULL già scattata
 *   prima della call) o non è nella mappa, lo snippet è trattato come
 *   always-on. Edge case raro: l'admin se ne accorge dal badge della
 *   sezione snippets ("Servizio collegato: nessuno (cancellato)").
 */
export function filterSnippetsByConsent(
  snippets: SiteSnippet[],
  consent: CookieConsentPrefs,
  serviceCategoryMap: Map<string, string>,
  bannerEnabled: boolean,
): SiteSnippet[] {
  return snippets.filter((s) => {
    if (!s.cookieServiceId) return true;
    const categoryId = serviceCategoryMap.get(s.cookieServiceId);
    if (!categoryId) return true;
    const prefKey = CATEGORY_TO_PREF_KEY[categoryId] ?? "preferences";
    if (prefKey === "necessary") return true;
    if (!bannerEnabled) return false;
    return consent[prefKey] === true;
  });
}
