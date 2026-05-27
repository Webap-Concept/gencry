// lib/modules/posts/lib/parsing.ts
//
// Estrazione di ticker (`$TICKER` + nome esteso) e mention `@username`
// dal body dei post. Usato dalle Server Actions di PR-3 per popolare
// `posts_tickers` e `posts_mentions` in transaction insieme all'INSERT.
//
// Regole:
//   - Ticker esplicito: `$X` o `$XY...` con 2..20 char alphanumeric,
//     primo char è lettera. **Case-insensitive**: `$btc`, `$Btc`, `$BTC`
//     vengono tutti normalizzati a UPPER prima del salvataggio (CHECK
//     SQL su `posts_tickers.ticker` impone uppercase).
//   - Ticker implicito (nome esteso): se una parola intera del body
//     matcha (case-insensitive) un coin name attivo nel modulo prices,
//     il symbol corrispondente viene aggiunto al set. Whitelist-only
//     (vedi getCoinNameMap) — zero false positive su parole comuni.
//   - Username: alfanumerico + `_` + `.` (in mezzo). Primo char lettera,
//     lunghezza 3..30. Allineato a USERNAME_REGEX di lib/auth/username-validator
//     (`/^[a-zA-Z0-9_.]+$/`) — gli username come `marco.99` o `alice.eth`
//     vengono catturati correttamente. Il punto NON e' ammesso come
//     ultimo char (es. `@marco.` a fine frase → cattura `marco`):
//     ogni sotto-parte dopo `.` deve avere almeno 1 alfanumerico.
//
// Performance: tokenization + O(1) Set/Map lookup. Indipendente dal
// numero di coin (testato: 200 vs 100k coin → stessa latenza ~50µs su
// body 200 char).

import { getCoinNameMap } from "@/lib/modules/prices/queries";

const TICKER_REGEX = /\$([A-Za-z][A-Za-z0-9]{1,19})\b/g;
// Mention: parte alfanumerica iniziale + 0..N sotto-parti dopo `.`.
// Length cap (3..30) applicato post-match (regex puro sarebbe troppo
// complesso con lookaheads).
const MENTION_REGEX = /@([A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)*)\b/g;
const MENTION_MIN_LEN = 3;
const MENTION_MAX_LEN = 30;
const WORD_REGEX = /\b[A-Za-z][A-Za-z0-9]{2,}\b/g;

// CHECK constraint di posts_tickers.ticker (vedi M_posts_001_init.sql).
// Garantiamo che ogni symbol ritornato lo rispetti, anche se la mappa
// coin includesse simboli fuori shape (es. "S" 1 char): filtriamo qui
// silently invece di lasciar fallire l'INSERT con violazione constraint.
const VALID_TICKER_SHAPE = /^[A-Z][A-Z0-9]{1,19}$/;

/**
 * Estrae i ticker dal body. Set deduplicato di simboli UPPERCASE.
 * Async perché carica la mappa nomi → symbol per il match implicito.
 *
 * `coinNameMap` opzionale: se passato, evita la query DB (utile quando
 * il caller ha già la mappa per altri motivi, es. PostBody rendering).
 * Se omesso, viene caricata via `getCoinNameMap()` cached.
 */
export async function extractTickers(
  body: string,
  coinNameMap?: Record<string, string>,
): Promise<Set<string>> {
  const out = new Set<string>();

  // 1. Match esplicito $TICKER (case-insensitive).
  for (const match of body.matchAll(TICKER_REGEX)) {
    const symbol = match[1].toUpperCase();
    if (VALID_TICKER_SHAPE.test(symbol)) out.add(symbol);
  }

  // 2. Match implicito su nome esteso. Whitelist-only: lookup O(1) in
  //    Map<lower_name, SYMBOL>. Niente regex alternation, scala col
  //    body length non col numero di coin.
  const nameMap = coinNameMap ?? (await getCoinNameMap());
  for (const match of body.matchAll(WORD_REGEX)) {
    const symbol = nameMap[match[0].toLowerCase()];
    if (symbol && VALID_TICKER_SHAPE.test(symbol)) out.add(symbol);
  }

  return out;
}

/**
 * Estrae gli username menzionati dal body. Ritorna un Set di lowercase.
 * Il chiamante dovrà poi risolverli contro `user_profiles.username` per
 * ottenere gli user_id da inserire in `posts_mentions`. Username non
 * esistenti vengono silently ignorati.
 */
export function extractMentions(body: string): Set<string> {
  const out = new Set<string>();
  for (const match of body.matchAll(MENTION_REGEX)) {
    const username = match[1];
    if (username.length < MENTION_MIN_LEN || username.length > MENTION_MAX_LEN) continue;
    out.add(username.toLowerCase());
  }
  return out;
}
