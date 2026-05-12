// lib/modules/onboarding/queries.ts
// Query del modulo onboarding: legge top coin per il picker, esegue search
// server-side, ritorna lo stato attuale del wizard per il calcolo dello
// step iniziale.
import { db } from "@/lib/db/drizzle";
import {
  onboardingCoinPicks,
  onboardingRiskProfile,
  pricesCoins,
} from "@/lib/db/schema";
import { getPricesConfig } from "@/lib/modules/prices/config";
import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";

export interface CoinOption {
  symbol: string;
  name: string;
  imageUrl: string | null;
}

const TOP_COINS_LIMIT = 50;
const SEARCH_LIMIT    = 30;

export const COIN_PICKS_MIN = 3;
export const COIN_PICKS_MAX = 20;

/**
 * Filtra l'imageUrl: accetta solo URL del nostro dominio R2 (custom domain
 * configurato in modules.prices.r2.public_base_url). Per le coin non ancora
 * migrate via backfill, restituiamo null così il wizard mostra solo iniziali
 * — niente fetch esterni dal frontend pubblico verso CoinGecko o altri CDN.
 */
function sanitizeImageUrl(url: string | null, r2BasePrefix: string | null): string | null {
  if (!url || !r2BasePrefix) return null;
  return url.startsWith(r2BasePrefix) ? url : null;
}

async function getR2BasePrefix(): Promise<string | null> {
  const cfg = await getPricesConfig();
  return cfg.r2 ? cfg.r2.publicBaseUrl + "/" : null;
}

/** Top coin per market cap, attive. Cache server-side via la richiesta. */
export async function getTopCoins(): Promise<CoinOption[]> {
  const [rows, prefix] = await Promise.all([
    db
      .select({
        symbol:   pricesCoins.symbol,
        name:     pricesCoins.name,
        imageUrl: pricesCoins.imageUrl,
      })
      .from(pricesCoins)
      .where(eq(pricesCoins.isActive, true))
      .orderBy(desc(pricesCoins.marketCap))
      .limit(TOP_COINS_LIMIT),
    getR2BasePrefix(),
  ]);
  return rows.map((r) => ({ ...r, imageUrl: sanitizeImageUrl(r.imageUrl, prefix) }));
}

/**
 * Search coin per symbol/name. Case-insensitive. Solo attive. Cap a 30 risultati
 * (basta per UX picker, evita di restituire l'intero catalogo).
 */
export async function searchCoins(query: string): Promise<CoinOption[]> {
  const q = query.trim();
  if (!q) return getTopCoins();
  const pattern = `%${q}%`;
  const [rows, prefix] = await Promise.all([
    db
      .select({
        symbol:   pricesCoins.symbol,
        name:     pricesCoins.name,
        imageUrl: pricesCoins.imageUrl,
      })
      .from(pricesCoins)
      .where(
        and(
          eq(pricesCoins.isActive, true),
          or(ilike(pricesCoins.symbol, pattern), ilike(pricesCoins.name, pattern)),
        ),
      )
      .orderBy(desc(pricesCoins.marketCap))
      .limit(SEARCH_LIMIT),
    getR2BasePrefix(),
  ]);
  return rows.map((r) => ({ ...r, imageUrl: sanitizeImageUrl(r.imageUrl, prefix) }));
}

/** Coin scelte da un utente, ordinate per position. */
export async function getUserCoinPicks(userId: string): Promise<string[]> {
  const rows = await db
    .select({ symbol: onboardingCoinPicks.coinSymbol })
    .from(onboardingCoinPicks)
    .where(eq(onboardingCoinPicks.userId, userId))
    .orderBy(asc(onboardingCoinPicks.position));
  return rows.map((r) => r.symbol);
}

export interface UserRiskState {
  profile: string;
  experience: string;
}

export async function getUserRiskProfile(
  userId: string,
): Promise<UserRiskState | null> {
  const [row] = await db
    .select({
      profile:    onboardingRiskProfile.profile,
      experience: onboardingRiskProfile.experience,
    })
    .from(onboardingRiskProfile)
    .where(eq(onboardingRiskProfile.userId, userId))
    .limit(1);
  return row ?? null;
}

/**
 * Sostituisce le coin picks dell'utente con la nuova lista (ordine preservato).
 * Validazione cardinalità + esistenza simboli avviene a monte nelle server actions.
 */
export async function replaceUserCoinPicks(
  userId: string,
  symbols: string[],
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .delete(onboardingCoinPicks)
      .where(eq(onboardingCoinPicks.userId, userId));
    if (symbols.length === 0) return;
    await tx.insert(onboardingCoinPicks).values(
      symbols.map((symbol, idx) => ({
        userId,
        coinSymbol: symbol,
        position: idx,
      })),
    );
  });
}

/** Upsert del risk profile (singola riga per utente). */
export async function upsertUserRiskProfile(
  userId: string,
  profile: string,
  experience: string,
): Promise<void> {
  await db
    .insert(onboardingRiskProfile)
    .values({ userId, profile, experience })
    .onConflictDoUpdate({
      target: onboardingRiskProfile.userId,
      set: { profile, experience, updatedAt: new Date() },
    });
}

/**
 * Verifica esistenza di un set di simboli in `prices_coins` (filtro server-side
 * per non fidarsi del client).
 */
export async function existingCoinSymbols(
  symbols: string[],
): Promise<Set<string>> {
  if (symbols.length === 0) return new Set();
  const rows = await db
    .select({ symbol: pricesCoins.symbol })
    .from(pricesCoins)
    .where(
      and(
        eq(pricesCoins.isActive, true),
        sql`${pricesCoins.symbol} IN (${sql.join(symbols.map((s) => sql`${s}`), sql`, `)})`,
      ),
    );
  return new Set(rows.map((r) => r.symbol));
}
