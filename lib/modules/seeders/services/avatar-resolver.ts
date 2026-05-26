// lib/modules/seeders/services/avatar-resolver.ts
//
// Orchestratore avatar: per ogni seed user
//   1. picka una strategy dal mix weighted
//   2. produce un'URL pronta da salvare in user_profiles.avatarUrl
//
// Strategie:
//   - ai_face                → fetch TPDNE/Unsplash + upload R2
//   - initials               → genera SVG + upload R2
//   - dicebear_<style>       → fetch DiceBear SVG + upload R2
//
// Tutte e tre le strategie finiscono uploadate su R2. Cosi' l'avatar
// servito al browser e' SEMPRE dallo stesso CDN (R2) anche per i
// seed users — niente dipendenze esterne al render-time.
//
// Fallback chain:
//   ai_face fail   → DiceBear lorelei
//   initials fail  → DiceBear notionists (con seed = username)
//   dicebear fail  → URL DiceBear diretta (no upload) come fallback finale
import "server-only";

import { pickAvatarStrategy, type AvatarMixWeights, type AvatarStrategy } from "./avatar-strategy";
import { fetchExternalAvatar } from "./external-avatar-fetch";
import { uploadAvatarFromUrl, uploadAvatarSvg } from "./r2-avatar-upload";
import { generateInitialsSvg, deriveInitials } from "./initials-avatar";

/**
 * Mapping strategy → DiceBear style param. Usato sia per la strategia
 * `dicebear_*` esplicita, sia come fallback per le altre strategie quando
 * upload R2 fallisce.
 */
const DICEBEAR_STYLES: Record<
  Extract<AvatarStrategy, `dicebear_${string}`>,
  string
> = {
  dicebear_notionists: "notionists",
  dicebear_lorelei: "lorelei",
  dicebear_bottts: "bottts",
};

function dicebearUrl(style: string, seed: string): string {
  return `https://api.dicebear.com/7.x/${style}/svg?seed=${encodeURIComponent(seed)}`;
}

export interface ResolveAvatarInput {
  userId: string;
  username: string;
  firstName: string;
  lastName: string;
  weights: AvatarMixWeights;
}

export interface ResolvedAvatar {
  url: string;
  strategy: AvatarStrategy;
  /** True se servito dal nostro R2; false se URL esterna fallback */
  onR2: boolean;
}

/**
 * Risolve l'avatar per un singolo seed user. Idempotente per strategia
 * pickata, ma il pick stesso e' Math.random — chiamate ripetute possono
 * dare strategy diverse. Non e' un problema: i seed run sono one-shot.
 */
export async function resolveAvatarForSeedUser(
  input: ResolveAvatarInput,
): Promise<ResolvedAvatar> {
  const strategy = pickAvatarStrategy(input.weights);

  switch (strategy) {
    case "ai_face": {
      const external = await fetchExternalAvatar();
      if (external) {
        const url = await uploadAvatarFromUrl(input.userId, external.sourceUrl);
        if (url) return { url, strategy, onR2: true };
      }
      // Fallback: lorelei come "soft AI-ish" alternative
      return resolveDicebearFallback(input, "dicebear_lorelei");
    }

    case "initials": {
      const initials = deriveInitials(input.firstName, input.lastName, input.username);
      const svg = generateInitialsSvg(initials, input.userId);
      const url = await uploadAvatarSvg(input.userId, svg);
      if (url) return { url, strategy, onR2: true };
      // R2 down → fallback DiceBear notionists (no upload necessario)
      return resolveDicebearFallback(input, "dicebear_notionists");
    }

    case "dicebear_notionists":
    case "dicebear_lorelei":
    case "dicebear_bottts": {
      // Anche DiceBear lo passiamo per R2 per consistenza/CDN unificata.
      // Fail → URL DiceBear diretta (sempre raggiungibile dal browser).
      const dicebearSvgUrl = dicebearUrl(DICEBEAR_STYLES[strategy], input.username);
      const r2Url = await uploadAvatarFromUrl(input.userId, dicebearSvgUrl);
      if (r2Url) return { url: r2Url, strategy, onR2: true };
      return { url: dicebearSvgUrl, strategy, onR2: false };
    }
  }
}

function resolveDicebearFallback(
  input: ResolveAvatarInput,
  fallbackStrategy: Extract<AvatarStrategy, `dicebear_${string}`>,
): ResolvedAvatar {
  // Direct URL fallback: niente upload R2 (siamo gia' in fallback path).
  // Il browser fa hit diretto a DiceBear, accettabile come ultima risorsa.
  const url = dicebearUrl(DICEBEAR_STYLES[fallbackStrategy], input.username);
  return { url, strategy: fallbackStrategy, onR2: false };
}
