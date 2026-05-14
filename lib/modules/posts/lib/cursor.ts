// lib/modules/posts/lib/cursor.ts
//
// Cursor keyset per la pagination del feed. Forma: base64url("ms:uuid"),
// dove `ms` è il timestamp Unix in millisecondi e `uuid` è l'id del
// post che ha quel timestamp.
//
// Perché 2-component cursor: con UUID v7 (time-ordered) l'id da solo
// basterebbe a ordinare, ma manteniamo `created_at` esplicito per due
// ragioni: (1) leggibilità nei log/debug; (2) restiamo compat con
// eventuali fonti che hanno UUID v4 random (es. comments inseriti via
// servizi esterni). Il costo è ~10 byte in più sul cursor encoded, nulla.
//
// Encoding base64url (non base64) per metterlo nei query-string senza
// escape, e per safe inclusion in path se mai servisse.

export type FeedCursor = {
  /** Unix epoch ms del `created_at` */
  ms: number;
  /** UUID del post che ha quel timestamp */
  id: string;
};

function base64urlEncode(s: string): string {
  return Buffer.from(s, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64urlDecode(s: string): string {
  // Re-pad
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64").toString(
    "utf8",
  );
}

export function encodeCursor(cur: FeedCursor): string {
  return base64urlEncode(`${cur.ms}:${cur.id}`);
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Decodifica + valida il cursor. Ritorna null se invalido (cursor
 * manomesso dal client, malformato, ecc.) — il chiamante deve trattarlo
 * come "no cursor" (prima pagina), NON come errore: malicious cursor
 * stampato da un altro utente non deve crashare il feed.
 */
export function decodeCursor(s: string | null | undefined): FeedCursor | null {
  if (!s) return null;
  try {
    const raw = base64urlDecode(s);
    const colon = raw.indexOf(":");
    if (colon === -1) return null;
    const ms = parseInt(raw.slice(0, colon), 10);
    const id = raw.slice(colon + 1);
    if (!Number.isFinite(ms) || ms < 0) return null;
    if (!UUID_REGEX.test(id)) return null;
    return { ms, id };
  } catch {
    return null;
  }
}

/**
 * Helper per costruire il cursor dal `created_at` di una riga DB.
 */
export function cursorFromRow(row: { createdAt: Date; id: string }): FeedCursor {
  return { ms: row.createdAt.getTime(), id: row.id };
}
