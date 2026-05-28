// lib/modules/watchlist/types.ts
//
// Tipi pubblici + Zod schemas + error codes del modulo watchlist.
// Importabili da actions (server) e dalla UI (client) senza trascinare
// drizzle/db dependency.

import { z } from "zod";

// ─── Visibility ────────────────────────────────────────────────────────
export const VISIBILITY_VALUES = ["private", "public"] as const;
export type WatchlistVisibility = (typeof VISIBILITY_VALUES)[number];

// ─── Validation schemas ────────────────────────────────────────────────
//
// Allineati ai CHECK SQL della migration (M_watchlist_001_init.sql):
//   - name 1..64
//   - slug regex `^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$` (oppure single char)
//   - visibility 'private' | 'public'
export const NAME_MAX = 64;
export const SLUG_MAX = 64;
export const DESCRIPTION_MAX = 500;
export const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
export const SYMBOL_REGEX = /^[A-Z][A-Z0-9]{0,19}$/;

export const watchlistNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(NAME_MAX);

export const watchlistSlugSchema = z
  .string()
  .trim()
  .max(SLUG_MAX)
  .regex(SLUG_REGEX);

export const watchlistDescriptionSchema = z
  .string()
  .trim()
  .max(DESCRIPTION_MAX)
  .optional();

export const watchlistVisibilitySchema = z.enum(VISIBILITY_VALUES);

export const coinSymbolSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(SYMBOL_REGEX);

export const createWatchlistInputSchema = z.object({
  name: watchlistNameSchema,
  description: watchlistDescriptionSchema,
  visibility: watchlistVisibilitySchema.optional(),
});
export type CreateWatchlistInput = z.infer<typeof createWatchlistInputSchema>;

export const updateWatchlistInputSchema = z.object({
  id: z.string().uuid(),
  name: watchlistNameSchema.optional(),
  description: watchlistDescriptionSchema,
  slug: watchlistSlugSchema.optional(),
});
export type UpdateWatchlistInput = z.infer<typeof updateWatchlistInputSchema>;

// ─── Result types (action returns) ─────────────────────────────────────
//
// Tutte le action ritornano ok-tagged union. La UI fa narrow su `ok` e
// gestisce error code -> i18n via namespace `watchlist.errors.*`.
export type WatchlistErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "cap_reached"
  | "coins_cap_reached"
  | "slug_taken"
  | "name_required"
  | "name_too_long"
  | "coin_not_supported"
  | "coin_already_added"
  | "rate_limited"
  | "validation"
  | "internal";

export type ActionFail = {
  ok: false;
  error: WatchlistErrorCode;
  /** Cap restituito da `get_user_watchlist_cap` quando rilevante (cap_reached
   *  e coins_cap_reached). */
  cap?: number;
  /** Secondi prima del retry per rate_limited. */
  retryAfter?: number;
};

export type CreateWatchlistResult =
  | { ok: true; id: string; slug: string }
  | ActionFail;

export type UpdateWatchlistResult = { ok: true } | ActionFail;

export type ToggleVisibilityResult =
  | { ok: true; visibility: WatchlistVisibility }
  | ActionFail;

export type ArchiveWatchlistResult = { ok: true } | ActionFail;

export type AddCoinResult =
  | { ok: true; symbol: string; coinsCount: number }
  | ActionFail;

export type RemoveCoinResult = { ok: true; coinsCount: number } | ActionFail;

// ─── DB error mapping ──────────────────────────────────────────────────
//
// Le `RAISE EXCEPTION 'watchlist_cap_reached'` dei trigger DB arrivano
// come Error con `.message` che CONTIENE il testo (Postgres lo wrappa
// in "ERROR:  watchlist_cap_reached"). Mappiamo per substring match —
// più resiliente al wrapping del driver postgres-js / drizzle.
export function mapDbErrorToCode(err: unknown): WatchlistErrorCode | null {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("watchlist_cap_reached")) return "cap_reached";
  if (msg.includes("watchlist_coins_cap_reached")) return "coins_cap_reached";
  if (msg.includes("uq_watchlists_user_slug")) return "slug_taken";
  // PK violation su watchlist_coins (watchlist_id, symbol)
  if (msg.includes("watchlist_coins_pkey")) return "coin_already_added";
  return null;
}

// ─── Read shapes (server -> UI) ────────────────────────────────────────
//
// `WatchlistSummary` = card della lista /watchlist. `WatchlistDetail` =
// pagina dedicata /watchlist/[id] (e /w/<u>/<slug> public-side).

export interface WatchlistCoinSummary {
  symbol: string;
  name: string;
  imageUrl: string | null;
  price: number;
  change24h: number | null;
  position: number;
}

export interface WatchlistSummary {
  id: string;
  userId: string;
  name: string;
  slug: string;
  description: string | null;
  visibility: WatchlistVisibility;
  position: number;
  coinsCount: number;
  followersCount: number;
  createdAt: Date;
  updatedAt: Date;
  /** Top N coin della watchlist (per render preview-card nella lista). */
  topCoins: WatchlistCoinSummary[];
  /** Perf 30g media delle coin contenute. Null se computation fallisce
   *  o se la watchlist e' vuota. */
  perf30dPct: number | null;
}

export interface WatchlistDetail extends WatchlistSummary {
  /** Tutte le coin della watchlist. `topCoins` del summary e' subset. */
  coins: WatchlistCoinSummary[];
  /** Username dell'owner (per /w/<username>/<slug>). */
  ownerUsername: string;
}
