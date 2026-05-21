// lib/admin/capacity/aggregate.ts
//
// Aggregator dei `CapacityProfile` per il widget dashboard
// `capacity-overview`. Mette insieme:
//   - I profili CORE (lib/admin/capacity/core-profiles.ts) — servizi
//     esterni usati dal sistema base (Postgres, Upstash, Realtime,
//     Storage, R2, Email, Vercel).
//   - I profili dei MODULI installati (dichiarati in ogni
//     `manifest.capacityProfiles`).
//
// Output piatto + categorizzato per group ("core" | "modules") + per
// modulo slug. Zero DB queries — tutto in memoria dai manifest.
import "server-only";

import { INSTALLED_MODULES } from "@/lib/modules/registry";
import type { CapacityProfile, CapacityTier } from "@/lib/modules/types";
import { CORE_CAPACITY_PROFILES } from "./core-profiles";

export interface CapacityRow {
  /** Identificatore stabile per la key React + per il routing al link
   *  di edit. Es. "core:core-database", "module:posts:comments". */
  id: string;
  /** "core" → servizio di sistema; "module" → da modulo installato. */
  group: "core" | "module";
  /** Slug del modulo se group="module"; null per core. */
  moduleSlug: string | null;
  /** Label del modulo (vuoto per core), usato come prefisso visivo. */
  moduleLabel: string | null;
  profile: CapacityProfile;
  /** Path RELATIVO (senza prefisso adminSlug runtime) per la pagina di
   *  edit dei tunables del profilo. Null per core (read-only — il file
   *  `core-profiles.ts` è la sorgente di verità, niente UI per ora).
   *  Il widget compone l'href finale con
   *  `buildAdminPathFromSlug(adminSlug, editPath)`. */
  editPath: string | null;
}

export interface CapacityOverview {
  rows: ReadonlyArray<CapacityRow>;
  summary: {
    total: number;
    byTier: Record<CapacityTier, number>;
    /** Il tier "peggiore" (alpha < beta < growth < scale) presente:
     *  pratica per il summary line "mostly alpha". */
    worstTier: CapacityTier;
  };
}

const TIER_ORDER: Record<CapacityTier, number> = {
  alpha: 0,
  beta: 1,
  growth: 2,
  scale: 3,
};

export async function getCapacityOverview(): Promise<CapacityOverview> {
  const rows: CapacityRow[] = [];

  // Core profiles (sempre presenti, non gateable dal RBAC modulo).
  for (const profile of CORE_CAPACITY_PROFILES) {
    rows.push({
      id: `core:${profile.scope}`,
      group: "core",
      moduleSlug: null,
      moduleLabel: null,
      profile,
      editPath: null,
    });
  }

  // Module profiles aggregati dai manifest. `INSTALLED_MODULES` è
  // statico, già caricato in memoria al boot — zero costo.
  for (const mod of INSTALLED_MODULES) {
    if (!mod.capacityProfiles?.length) continue;
    for (const profile of mod.capacityProfiles) {
      rows.push({
        id: `module:${mod.slug}:${profile.scope}`,
        group: "module",
        moduleSlug: mod.slug,
        moduleLabel: mod.label,
        profile,
        // Convenzione: ogni modulo che dichiara uno scope tunable ha una
        // pagina admin `modules/<slug>/<scope>` sotto l'admin URL slug
        // runtime. Path RELATIVO senza prefisso — il widget compone
        // l'href finale con `buildAdminPathFromSlug(adminSlug, …)`.
        // Best-effort: se la pagina non esiste, l'admin atterra su 404
        // (segnale che il modulo ha dichiarato uno scope senza UI).
        editPath: `modules/${mod.slug}/${profile.scope}`,
      });
    }
  }

  // Summary
  const byTier: Record<CapacityTier, number> = {
    alpha: 0,
    beta: 0,
    growth: 0,
    scale: 0,
  };
  let worstTier: CapacityTier = "scale";
  for (const r of rows) {
    byTier[r.profile.currentTier]++;
    if (TIER_ORDER[r.profile.currentTier] < TIER_ORDER[worstTier]) {
      worstTier = r.profile.currentTier;
    }
  }

  return {
    rows,
    summary: { total: rows.length, byTier, worstTier },
  };
}
