// lib/home/registry.ts
//
// Composizione + resolver del registry delle sezioni home. Pattern
// "slot-based registry" — vedi project_home_slot_registry.md per la
// motivazione architetturale.
//
// **Aggiungere un modulo alla home**: importare qui le sue sezioni dal
// proprio `lib/modules/<slug>/home-sections.ts` e spreadarle in
// HOME_SECTIONS. Niente side-effect imports (anti-pattern: breakable
// da tree-shaking).
//
// **Toglierle**: rimuovere l'import. Nessun grep cross-modulo
// necessario, isolamento totale.
//
// La pure logic (resolver + validation) vive in `registry-utils.ts`
// così è testabile in vitest (env Node) senza `server-only`.

import "server-only";
import { CORE_HOME_SECTIONS } from "./core-sections";
import { POSTS_HOME_SECTIONS } from "@/lib/modules/posts/home-sections";
import { resolveSlotFrom, validateSections } from "./registry-utils";
import type { HomeSection, HomeSlot } from "./types";

/**
 * La sola lista di verità delle sezioni della home loggata.
 *
 * Composizione esplicita: ogni modulo che vuole apparire in home
 * esporta una const tipo `POSTS_HOME_SECTIONS` e la spreddiamo qui.
 *
 *   import { POSTS_HOME_SECTIONS } from "@/lib/modules/posts/home-sections";
 *   …
 *   export const HOME_SECTIONS: HomeSection[] = [
 *     ...CORE_HOME_SECTIONS,
 *     ...POSTS_HOME_SECTIONS,
 *   ];
 *
 * In `gencry-core` (build white-label senza moduli social) restano
 * solo le entry core — il build resta pulito, niente dipendenze fantasma.
 */
export const HOME_SECTIONS: HomeSection[] = [
  ...CORE_HOME_SECTIONS,
  ...POSTS_HOME_SECTIONS,
];

// Validazione runtime al boot del modulo: cattura errori di registrazione
// (key duplicate, slot inesistente, order collision). Log warning su
// console, MAI throw — una sezione malformata non deve impedire il render.
for (const w of validateSections(HOME_SECTIONS)) {
  console.warn(`[home/registry] ${w}`);
}

/**
 * Risolve le sezioni visibili per uno slot del registry globale.
 * Logga in console gli errori dei gate (sezioni con `isEnabled` che
 * throw vengono trattate come disabilitate).
 */
export async function resolveSlot(slot: HomeSlot): Promise<HomeSection[]> {
  const result = await resolveSlotFrom(slot, HOME_SECTIONS);
  for (const e of result.gateErrors) {
    console.warn(
      `[home/registry] isEnabled() threw for section "${e.key}" — treating as disabled.`,
      e.error,
    );
  }
  return result.sections;
}
