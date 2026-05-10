// lib/admin-paths.ts
//
// Server-side helpers per il prefisso URL del pannello admin.
//
// Architettura URL admin:
//   - File system: cartella fissa `app/(admin)/admin/` (impossibile usare
//     `[adminSlug]` come segmento dinamico top-level perché collide con
//     `app/[locale]/...` di next-intl).
//   - URL pubblico: `/<adminSlug>/...` — runtime configurabile via DB
//     setting `admin.url_slug` (default 'admin').
//   - Traduzione: rewrite invisibile in `proxy.ts`. L'utente vede sempre
//     `/<adminSlug>/...`, internamente Next risolve `app/(admin)/admin/...`.
//
// Pattern di uso:
//   - Server (lib, server actions, route handlers, RSC):
//       const slug = await getAdminUrlSlug();
//       redirect(`/${slug}/settings/general`);
//     oppure
//       const path = await getAdminPath('users-list'); // "/<slug>/access/users"
//
//   - Client component dentro l'area admin: leggere lo slug via
//     `useAdminSlug()` da `app/(admin)/admin/_components/admin-slug-context`,
//     e combinare con `getAdminRelPath('key')` + `buildAdminPathFromSlug`.

import "server-only";

import { unstable_cache } from "next/cache";
import { getAppSettings } from "@/lib/db/settings-queries";
import {
  DEFAULT_ADMIN_URL_SLUG,
  validateAdminSlugSync,
} from "@/lib/admin-paths-shared";

// Re-export delle costanti/utilità sync da admin-paths-shared.ts. I server
// possono importare tutto da qui per comodità; i Client Component DEVONO
// importare da admin-paths-shared.ts (questo file ha `server-only`).
export {
  ADMIN_RESERVED_SLUGS,
  DEFAULT_ADMIN_URL_SLUG,
  buildAdminPathFromSlug,
  validateAdminSlugSync,
  type ValidateAdminSlugResult,
} from "@/lib/admin-paths-shared";

/** Tag per `updateTag()` quando l'admin cambia lo slug dalla UI. Senza
 *  invalidate, il proxy.ts e i caller server-side vedrebbero il vecchio
 *  slug fino al revalidate ciclico di 60s. */
export const ADMIN_URL_SLUG_TAG = "admin-url-slug";

/**
 * Lettura cached del slug corrente. Cache 60s + tag per invalidate
 * immediato dopo un save admin. La tag invalidation è critica perché
 * il proxy.ts chiama questa funzione su OGNI request — un valore stale
 * di 60s significa che gli utenti per fino a un minuto possono atterrare
 * in 404 (vecchio slug) o nel public CMS (nuovo slug non ancora visto).
 */
const fetchSlug = async (): Promise<string> => {
  // NB: niente try/catch qui. Le eccezioni (DB down, timeout, ecc.) devono
  // propagare a `getAdminUrlSlug()` che decide tra last-known e default.
  // Catturare qui significherebbe POPOLARE la unstable_cache col valore
  // default per 60s, congelando il sintomo "admin = 404" anche dopo che
  // il DB è tornato online.
  const s = await getAppSettings();
  const v = s["admin.url_slug"]?.trim();
  if (!v) return DEFAULT_ADMIN_URL_SLUG;
  // Defense in depth: anche se qualcuno ha messo un valore invalido
  // direttamente in DB, non lasciamolo "rompere" il routing.
  const validated = validateAdminSlugSync(v);
  return validated.ok ? validated.slug : DEFAULT_ADMIN_URL_SLUG;
};

const fetchSlugCached = unstable_cache(fetchSlug, ["admin-url-slug"], {
  revalidate: 60,
  tags: [ADMIN_URL_SLUG_TAG],
});

/**
 * Last-known good value, in process memory. Vive per la durata del
 * worker (in produzione: una serverless function instance), non è
 * condiviso fra istanze. Sopravvive a un cache miss + DB timeout
 * occasionale: il proxy continua a vedere lo slug giusto invece di
 * fallback-are al default e mandare TUTTE le request admin nel CMS
 * 404. Si aggiorna OGNI VOLTA che `fetchSlug` ritorna con successo.
 *
 * Pattern intentionalmente più resiliente del solo `unstable_cache`:
 * la cache di Next può evictare in regioni edge differenti, qui invece
 * abbiamo un floor permanente (per la lifetime del worker).
 */
let lastKnownSlug: string | null = null;

export async function getAdminUrlSlug(): Promise<string> {
  // Outer try/catch difensivo: copre sia errori interni di fetchSlug, sia
  // il caso "Invariant: incrementalCache missing" che `unstable_cache`
  // lancia quando viene invocato fuori dal runtime Next.js (es. vitest).
  // Senza questo i test che mockano solo `getUser` ma poi finiscono in
  // un guard che chiama `getAdminUrlSlug` esploderebbero invece di
  // testare il comportamento del guard stesso.
  try {
    const slug = await fetchSlugCached();
    lastKnownSlug = slug;
    return slug;
  } catch {
    // Preferisci l'ultimo valore conosciuto al default. In produzione
    // su slug custom (es. "businessmanager") il default "admin" manderebbe
    // tutte le request admin nel CMS catch-all → 404 frontend, finché il
    // DB non ritorna. Con last-known il sintomo svanisce dopo il primo
    // hit andato a buon fine, e gli outage successivi non lo riprodurranno.
    return lastKnownSlug ?? DEFAULT_ADMIN_URL_SLUG;
  }
}

/**
 * Costruisce un path admin assoluto a partire da un sottopath relativo
 * (senza il prefisso slug). I valori in lib/admin-nav.ts sono "relativi"
 * (es. "/access/users") proprio per essere combinati qui.
 *
 *   await buildAdminPath("/access/users") → "/admin/access/users"
 *   await buildAdminPath("access/users")  → "/admin/access/users"
 *   await buildAdminPath("")              → "/admin"
 *   await buildAdminPath("/")             → "/admin"
 */
export async function buildAdminPath(relativePath: string): Promise<string> {
  const slug = await getAdminUrlSlug();
  const cleaned = relativePath.replace(/^\/+/, "").replace(/\/+$/, "");
  return cleaned === "" ? `/${slug}` : `/${slug}/${cleaned}`;
}

/**
 * Ritorna il path ASSOLUTO admin (es. "/admincontrol/access/users") per
 * una chiave del nav registry. Server-only (questo file ha `server-only`).
 *
 * Per i Client Component usare invece:
 *   `buildAdminPathFromSlug(useAdminSlug(), getAdminRelPath(key))`.
 */
export async function getAdminPath(key: string): Promise<string> {
  const { getAdminRelPath } = await import("@/lib/admin-nav");
  return buildAdminPath(getAdminRelPath(key));
}

