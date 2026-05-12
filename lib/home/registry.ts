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

import "server-only";
import { CORE_HOME_SECTIONS } from "./core-sections";
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
];

// Validazione runtime al boot del modulo: cattura errori di registrazione
// che TypeScript da solo non vede (key duplicate, slot inesistente, order
// collision in-slot). Log warning su console, MAI throw — una sezione
// malformata non deve impedire il render del resto della home.
(function validateRegistry() {
  const VALID_SLOTS: HomeSlot[] = [
    "home.hero",
    "home.main.top",
    "home.main",
    "home.main.bottom",
    "home.rail.top",
    "home.rail.middle",
    "home.rail.bottom",
  ];
  const seenKeys = new Set<string>();
  const seenOrders = new Map<string, Set<number>>(); // slot → set di order

  for (const s of HOME_SECTIONS) {
    if (seenKeys.has(s.key)) {
      console.warn(`[home/registry] duplicate key "${s.key}" — React will warn at render.`);
    }
    seenKeys.add(s.key);

    if (!VALID_SLOTS.includes(s.slot)) {
      console.warn(`[home/registry] section "${s.key}" uses unknown slot "${s.slot}". Will never render.`);
    }

    const slotOrders = seenOrders.get(s.slot) ?? new Set<number>();
    if (slotOrders.has(s.order)) {
      console.warn(
        `[home/registry] section "${s.key}" collides on order=${s.order} in slot "${s.slot}" — render order non-deterministic.`,
      );
    }
    slotOrders.add(s.order);
    seenOrders.set(s.slot, slotOrders);
  }
})();

/**
 * Risolve le sezioni visibili per uno slot. Per ogni candidata applica
 * il gate `isEnabled()` (in parallelo) e ordina per `order`. Ritorna
 * l'array già pronto per essere renderizzato in page.
 *
 * Eccezioni nei gate vengono catturate per non far esplodere la home:
 * se `isEnabled` butta, la sezione è considerata disabilitata e si
 * logga in console. Errori del rendering della sezione invece sono
 * gestiti da `<SlotBoundary>` lato React tree.
 */
export async function resolveSlot(slot: HomeSlot): Promise<HomeSection[]> {
  const candidates = HOME_SECTIONS.filter((s) => s.slot === slot);
  if (candidates.length === 0) return [];

  const gated = await Promise.all(
    candidates.map(async (section) => {
      if (!section.isEnabled) return { section, ok: true };
      try {
        const ok = await section.isEnabled();
        return { section, ok };
      } catch (err) {
        console.warn(
          `[home/registry] isEnabled() threw for section "${section.key}" — treating as disabled.`,
          err,
        );
        return { section, ok: false };
      }
    }),
  );

  return gated
    .filter((g) => g.ok)
    .map((g) => g.section)
    .sort((a, b) => a.order - b.order);
}
