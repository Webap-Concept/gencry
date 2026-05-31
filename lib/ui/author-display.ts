// lib/ui/author-display.ts
//
// Helper di display per gli autori/profili. Centralizza la regola del
// "nome da mostrare": per gli account azienda è la ragione sociale
// (companyName), per i personali nome+cognome o, in fallback, lo username.
//
// L'@username (handle) resta invariato ovunque — qui si decide solo il
// display name visibile.

export interface AuthorNameLike {
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  accountType?: "personal" | "business" | null;
  companyName?: string | null;
}

/**
 * Nome da mostrare per un autore.
 *   - business con companyName → companyName
 *   - altrimenti → "Nome Cognome", poi username, poi fallback.
 *
 * `fallback` è ciò che si mostra quando non c'è alcun nome (raro: utenti
 * senza username). Default stringa vuota: il caller decide come gestirlo.
 */
export function displayNameForAuthor(
  a: AuthorNameLike,
  fallback = "",
): string {
  if (a.accountType === "business") {
    const company = a.companyName?.trim();
    if (company) return company;
  }
  const full = [a.firstName, a.lastName]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join(" ");
  if (full) return full;
  const handle = a.username?.trim();
  if (handle) return handle;
  return fallback;
}
