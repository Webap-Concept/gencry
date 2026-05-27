// lib/modules/seeders/services/avatar-strategy.ts
//
// Strategy picker per gli avatar dei seed users. Mix bilanciato per
// riprodurre la distribuzione reale dei social crypto:
//
//   - 40% AI face   (foto realistica StyleGAN, upload R2)
//   - 30% initials  (SVG hand-made: utente che non ha caricato foto)
//   - 15% notionists (DiceBear illustrazione moderna)
//   - 10% lorelei   (DiceBear variante softer)
//   -  5% bottts    (DiceBear robot/anon — crypto degen aesthetic)
//
// Pesi tunable via app_settings (`modules.seeders.avatar_mix_*`).
//
// Pattern: weighted random pick. Niente seedability deterministica per
// stesso username (i seed run sono one-shot, niente re-pick atteso).
import "server-only";

import { getAppSettings } from "@/lib/db/settings-queries";

export const AVATAR_STRATEGIES = [
  "ai_face",
  "initials",
  "dicebear_notionists",
  "dicebear_lorelei",
  "dicebear_bottts",
] as const;

export type AvatarStrategy = (typeof AVATAR_STRATEGIES)[number];

export interface AvatarMixWeights {
  ai_face: number;
  initials: number;
  dicebear_notionists: number;
  dicebear_lorelei: number;
  dicebear_bottts: number;
}

const DEFAULT_WEIGHTS: AvatarMixWeights = {
  ai_face: 40,
  initials: 30,
  dicebear_notionists: 15,
  dicebear_lorelei: 10,
  dicebear_bottts: 5,
};

function parseWeight(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

/**
 * Legge i pesi mix dalle settings. Se la somma e' 0 (admin ha azzerato
 * tutto) usa i default per evitare divisione per zero nel pick.
 */
export async function loadAvatarMixWeights(): Promise<AvatarMixWeights> {
  const s = await getAppSettings();
  const w: AvatarMixWeights = {
    ai_face:             parseWeight(s["modules.seeders.avatar_mix_ai_face"],             DEFAULT_WEIGHTS.ai_face),
    initials:            parseWeight(s["modules.seeders.avatar_mix_initials"],            DEFAULT_WEIGHTS.initials),
    dicebear_notionists: parseWeight(s["modules.seeders.avatar_mix_dicebear_notionists"], DEFAULT_WEIGHTS.dicebear_notionists),
    dicebear_lorelei:    parseWeight(s["modules.seeders.avatar_mix_dicebear_lorelei"],    DEFAULT_WEIGHTS.dicebear_lorelei),
    dicebear_bottts:     parseWeight(s["modules.seeders.avatar_mix_dicebear_bottts"],     DEFAULT_WEIGHTS.dicebear_bottts),
  };
  const total = w.ai_face + w.initials + w.dicebear_notionists + w.dicebear_lorelei + w.dicebear_bottts;
  return total > 0 ? w : DEFAULT_WEIGHTS;
}

/**
 * Weighted random pick. Pesi non normalizzati (la somma puo' essere
 * qualsiasi, il pick fa il modulo).
 */
export function pickAvatarStrategy(weights: AvatarMixWeights): AvatarStrategy {
  const total =
    weights.ai_face +
    weights.initials +
    weights.dicebear_notionists +
    weights.dicebear_lorelei +
    weights.dicebear_bottts;
  let r = Math.random() * total;
  if ((r -= weights.ai_face) < 0)             return "ai_face";
  if ((r -= weights.initials) < 0)            return "initials";
  if ((r -= weights.dicebear_notionists) < 0) return "dicebear_notionists";
  if ((r -= weights.dicebear_lorelei) < 0)    return "dicebear_lorelei";
  return "dicebear_bottts";
}
