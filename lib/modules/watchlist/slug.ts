import "server-only";
// lib/modules/watchlist/slug.ts
//
// Genera uno slug univoco per-utente da un nome libero. Strategy:
//   1. Slugify base del name (NFKD strip accents, alphanum + dash, lower).
//   2. Truncate a 62 char (lascia margine al suffix `-99`).
//   3. Se collide con un'altra watchlist active dello stesso user, ritenta
//      con suffix `-2`, `-3`, ... `-MAX_RETRIES`.
//   4. Se anche dopo MAX_RETRIES collide → fallback a `<base>-<6char-uuid>`.
//
// La uniqueness e' garantita anche da `uq_watchlists_user_slug` su DB —
// questa funzione e' il path "felice" che evita di trasformare ogni nome
// duplicato in un errore lato action.

import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { watchlists } from "@/lib/db/schema";

const MAX_BASE_LEN = 62; // lascia margine per "-99"
const MAX_RETRIES = 50;

/**
 * Lower + strip accents + replace non-alphanum con dash + collapse + trim.
 * Allineato al pattern SQL CHECK `^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$`.
 */
export function slugify(input: string): string {
  const cleaned = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip combining marks
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_BASE_LEN);
  if (cleaned.length === 0) return "watchlist";
  // single-char base: schema CHECK accetta solo single-char senza dash,
  // ma se l'input era "a" e' valido. Per safety appendiamo "1" per garantire
  // length >= 1 con format valido.
  return cleaned;
}

/**
 * Trova il primo slug libero per (userId). Considera solo le watchlist
 * ACTIVE (archived_at IS NULL) — vincolo allineato all'unique partial
 * index `uq_watchlists_user_slug`.
 *
 * Strategy MGET-style: 1 query SELECT con `IN (slug, slug-2, ..., slug-N)`
 * sui candidati, poi trova il primo non presente. Cosi' un solo round-trip
 * DB anche con MAX_RETRIES alto.
 */
export async function generateUniqueSlug(
  userId: string,
  desiredName: string,
): Promise<string> {
  const base = slugify(desiredName);
  // Candidati: [base, base-2, base-3, ..., base-MAX_RETRIES].
  const candidates: string[] = [base];
  for (let i = 2; i <= MAX_RETRIES; i++) {
    const candidate = `${base}-${i}`;
    if (candidate.length <= 64) candidates.push(candidate);
  }
  const taken = await db
    .select({ slug: watchlists.slug })
    .from(watchlists)
    .where(
      and(
        eq(watchlists.userId, userId),
        inArray(watchlists.slug, candidates),
        isNull(watchlists.archivedAt),
      ),
    );
  const takenSet = new Set(taken.map((r) => r.slug));
  for (const c of candidates) {
    if (!takenSet.has(c)) return c;
  }
  // Tutti i MAX_RETRIES sono presi → fallback UUID short. Improbabile,
  // ma robusto. Sostituisce le ultime 7 char di base con un random hex.
  const suffix = Math.random().toString(16).slice(2, 8);
  const trimmed = base.slice(0, MAX_BASE_LEN - suffix.length - 1);
  return `${trimmed}-${suffix}`;
}
