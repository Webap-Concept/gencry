// lib/home/registry-utils.ts
//
// Pure functions del registry. Vivono qui SENZA `server-only` perché
// devono essere testabili in vitest (env Node). Il `registry.ts` server-only
// le importa e le applica al singleton globale `HOME_SECTIONS`.
//
// Niente side effects, niente DB access, niente console.warn — quelli
// vivono in `registry.ts` (boot-time validation, error logging).

import type { HomeSection, HomeSlot } from "./types";

export const VALID_SLOTS: HomeSlot[] = [
  "home.hero",
  "home.main.top",
  "home.main",
  "home.main.bottom",
  "home.rail.top",
  "home.rail.middle",
  "home.rail.bottom",
];

/**
 * Valida un array di sezioni e ritorna l'elenco dei warning trovati.
 * Non logga, non throwa — il caller decide che farne.
 *
 * Warning prodotti:
 *  - "duplicate key \"X\"" — chiavi duplicate
 *  - "section \"X\" uses unknown slot \"Y\"" — slot non valido
 *  - "section \"X\" collides on order=N in slot \"Y\"" — ordering ambiguo
 */
export function validateSections(sections: HomeSection[]): string[] {
  const warnings: string[] = [];
  const seenKeys = new Set<string>();
  const seenOrders = new Map<string, Set<number>>();

  for (const s of sections) {
    if (seenKeys.has(s.key)) {
      warnings.push(`duplicate key "${s.key}"`);
    }
    seenKeys.add(s.key);

    if (!VALID_SLOTS.includes(s.slot)) {
      warnings.push(`section "${s.key}" uses unknown slot "${s.slot}"`);
    }

    const slotOrders = seenOrders.get(s.slot) ?? new Set<number>();
    if (slotOrders.has(s.order)) {
      warnings.push(
        `section "${s.key}" collides on order=${s.order} in slot "${s.slot}"`,
      );
    }
    slotOrders.add(s.order);
    seenOrders.set(s.slot, slotOrders);
  }

  return warnings;
}

export interface ResolveResult {
  sections: HomeSection[];
  /** Warning su gate che hanno throw — utile per logging dal caller. */
  gateErrors: Array<{ key: string; error: unknown }>;
}

/**
 * Risolve le sezioni per uno slot da un array fornito.
 *
 * Comportamento:
 *  - filtra per slot
 *  - applica i gate `isEnabled` in parallelo
 *  - cattura eccezioni nei gate (sezione → disabilitata, errore in `gateErrors`)
 *  - ordina ascendente per `order`
 */
export async function resolveSlotFrom(
  slot: HomeSlot,
  sections: HomeSection[],
): Promise<ResolveResult> {
  const candidates = sections.filter((s) => s.slot === slot);
  if (candidates.length === 0) {
    return { sections: [], gateErrors: [] };
  }

  const gateErrors: ResolveResult["gateErrors"] = [];

  const gated = await Promise.all(
    candidates.map(async (section) => {
      if (!section.isEnabled) return { section, ok: true };
      try {
        const ok = await section.isEnabled();
        return { section, ok };
      } catch (err) {
        gateErrors.push({ key: section.key, error: err });
        return { section, ok: false };
      }
    }),
  );

  const resolved = gated
    .filter((g) => g.ok)
    .map((g) => g.section)
    .sort((a, b) => a.order - b.order);

  return { sections: resolved, gateErrors };
}
