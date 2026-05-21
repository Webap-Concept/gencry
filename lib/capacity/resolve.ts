import "server-only";
// lib/capacity/resolve.ts
//
// Helper per derivare il tier corrente di un CapacityProfile partendo dai
// valori effettivi salvati in app_settings. Il manifest dichiara
// `currentTier` come default statico; in realtà il tier visibile in UI
// dipende da QUALE preset (se uno) corrisponde ai valori correnti. Se
// l'admin ha modificato manualmente fuori dai preset → "custom".
//
// Usato da tutti i form admin che mostrano il CapacityProfileHeader per
// evidenziare il preset attualmente in vigore.
import type { CapacityProfile, CapacityTier } from "@/lib/modules/types";

export type ResolvedCapacityTier = CapacityTier | "custom";

/**
 * Confronta i valori correnti dei tunables del profilo con i `values`
 * di ciascun preset. Ritorna l'id del preset matchante, oppure "custom"
 * se nessuno corrisponde esattamente. Il match è full-equality su
 * TUTTI i tunables del profilo (più stringente di "subset match" per
 * evitare ambiguità quando 2 preset condividono valori parziali).
 */
export function resolveCapacityCurrentTier(
  profile: CapacityProfile,
  settings: Record<string, string | null | undefined>,
): ResolvedCapacityTier {
  for (const preset of profile.presets ?? []) {
    let match = true;
    for (const tunable of profile.tunables ?? []) {
      const presetValue = preset.values[tunable.key];
      // Se il preset non dichiara un valore per questo tunable, skip
      // (alcuni preset variano solo alcuni tunables — vedi MEDIA dove
      // body_length non cambia tra alpha/beta/growth).
      if (presetValue === undefined) continue;
      const currentValue = settings[tunable.key];
      if (String(currentValue ?? "") !== String(presetValue)) {
        match = false;
        break;
      }
    }
    if (match) return preset.id;
  }
  return "custom";
}
