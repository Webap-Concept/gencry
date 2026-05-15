// lib/modules/seeders/services/mood-types.ts
//
// Mood archetypes per i seed users. Ognuno ha:
//   - un sub-pool di template (in content-templates-it.ts)
//   - una preferenza sul ticker pick (bullish → coin in crescita,
//     bearish → coin in calo, defi → preferenza per coin DeFi-related)
//   - una distribution probability per il random assignment
//
// 8 archetipi che coprono lo spettro tipico della community crypto.

export type UserMood =
  | "bullish_btc"
  | "bearish"
  | "hodler"
  | "trader"
  | "defi"
  | "macro"
  | "newbie"
  | "degen";

/**
 * Distribuzione % dei mood al seed time. Somma a 100. Bullish/hodler
 * leggermente sovra-rappresentati perché matchano la maggioranza
 * "normale" dei retail; bearish/macro sotto-rappresentati ma presenti
 * per realismo (community equilibrata).
 */
export const MOOD_DISTRIBUTION: Record<UserMood, number> = {
  bullish_btc: 18,
  bearish: 10,
  hodler: 20,
  trader: 14,
  defi: 12,
  macro: 8,
  newbie: 10,
  degen: 8,
};

const MOOD_KEYS = Object.keys(MOOD_DISTRIBUTION) as UserMood[];
const CUMULATIVE: Array<{ mood: UserMood; threshold: number }> = (() => {
  let acc = 0;
  return MOOD_KEYS.map((mood) => {
    acc += MOOD_DISTRIBUTION[mood];
    return { mood, threshold: acc };
  });
})();

/** Picks un mood weighted by MOOD_DISTRIBUTION. */
export function pickRandomMood(): UserMood {
  const r = Math.random() * 100;
  for (const entry of CUMULATIVE) {
    if (r < entry.threshold) return entry.mood;
  }
  return "hodler"; // fallback
}

/**
 * Preferenza trend del mood. Usata da posts-contributor per scegliere
 * il `{ticker}` in modo coerente: un bullish parla di coin in crescita,
 * un bearish di coin in calo, etc.
 */
export type TrendPreference = "bullish" | "bearish" | "any";

export const MOOD_TREND_PREFERENCE: Record<UserMood, TrendPreference> = {
  bullish_btc: "bullish",
  bearish: "bearish",
  hodler: "any",
  trader: "any",
  defi: "any",
  macro: "bearish", // macro-skeptic tende a essere cauto
  newbie: "any",
  degen: "bullish",
};
