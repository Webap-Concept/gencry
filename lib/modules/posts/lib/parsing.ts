// lib/modules/posts/lib/parsing.ts
//
// Estrazione di ticker `$TICKER` e mention `@username` dal body dei post.
// Usato dalle Server Actions di PR-3 per popolare `posts_tickers` e
// `posts_mentions` in transaction insieme all'INSERT del post.
//
// Regole (allineate con i CHECK SQL della migration M_posts_001):
//   - Ticker: `$X` o `$XY...` con 2..20 caratteri uppercase + digit, primo
//     char è una lettera. Match case-sensitive: lowercase NON viene
//     considerato ticker (i ticker sono convenzionalmente uppercase).
//   - Username: 3..30 caratteri alfanumerico + underscore, primo char è
//     una lettera (allineato con la regola dell'admin onboarding).
//     Normalizzato a lowercase per il lookup.
//
// Performance: regex compilate a livello di modulo (no recompile per call),
// `matchAll()` zero-alloc su body fino a qualche MB. Per body 2000 char il
// costo è trascurabile.

const TICKER_REGEX = /\$([A-Z][A-Z0-9]{1,19})\b/g;
const MENTION_REGEX = /@([A-Za-z][A-Za-z0-9_]{2,29})\b/g;

/**
 * Estrae i ticker dal body. Ritorna un Set deduplicato (un post con
 * $BTC $BTC $ETH popola posts_tickers con 2 righe, non 3).
 */
export function extractTickers(body: string): Set<string> {
  const out = new Set<string>();
  for (const match of body.matchAll(TICKER_REGEX)) {
    out.add(match[1]);
  }
  return out;
}

/**
 * Estrae gli username menzionati dal body. Ritorna un Set di lowercase.
 * Il chiamante dovrà poi risolverli contro `user_profiles.username` per
 * ottenere gli user_id da inserire in `posts_mentions`. Username non
 * esistenti vengono silently ignorati (il @nick rimane visualizzato come
 * link non risolto nel rendering).
 */
export function extractMentions(body: string): Set<string> {
  const out = new Set<string>();
  for (const match of body.matchAll(MENTION_REGEX)) {
    out.add(match[1].toLowerCase());
  }
  return out;
}
