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
import type {
  CapacityProfile,
  CapacityTier,
  CapacityUsageProbe,
} from "@/lib/modules/types";
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

/** Per ogni risorsa, lo snapshot live (se la risorsa ha `loadUsage`).
 *  Key: `<rowId>::<resourceName>` per disambiguare resources con stesso
 *  name in profili diversi. Mai null: `{ error }` se la probe fallisce.
 *  Le probe possono ritornare 1 o più metriche; qui le normalizziamo
 *  sempre come array (singolo probe → `[probe]`). */
export type ResourceUsageMap = Record<
  string,
  CapacityUsageProbe[] | { error: string }
>;

export function resourceUsageKey(rowId: string, resourceName: string): string {
  return `${rowId}::${resourceName}`;
}

export interface CapacityOverview {
  rows: ReadonlyArray<CapacityRow>;
  summary: {
    total: number;
    byTier: Record<CapacityTier, number>;
    /** Il tier "peggiore" (alpha < beta < growth < scale) presente:
     *  pratica per il summary line "mostly alpha". */
    worstTier: CapacityTier;
    /** Somma dei `monthlyCost` dichiarati su ogni resource. USD/mese.
     *  Non include overage runtime — vedi caveat in core-profiles.ts. */
    totalMonthlyCost: number;
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

  // Summary: tier breakdown + worst + cost totale
  const byTier: Record<CapacityTier, number> = {
    alpha: 0,
    beta: 0,
    growth: 0,
    scale: 0,
  };
  let worstTier: CapacityTier = "scale";
  let totalMonthlyCost = 0;
  for (const r of rows) {
    byTier[r.profile.currentTier]++;
    if (TIER_ORDER[r.profile.currentTier] < TIER_ORDER[worstTier]) {
      worstTier = r.profile.currentTier;
    }
    for (const res of r.profile.resources) {
      totalMonthlyCost += res.monthlyCost ?? 0;
    }
  }

  return {
    rows,
    summary: { total: rows.length, byTier, worstTier, totalMonthlyCost },
  };
}

/**
 * Probe live di usage per le risorse che hanno dichiarato `loadUsage`.
 * Lazy + parallel via Promise.allSettled — una probe che crasha non
 * abbatte l'intera dashboard, e i probe vengono caricati solo quando
 * l'admin apre la pagina capacity (mai al boot del registry).
 *
 * Ritorna mappa keyed per `resourceUsageKey(rowId, resourceName)`. La UI
 * legge `usage[resourceUsageKey(r.id, res.name)]` e degrada a "n/d"
 * (resource senza loadUsage) o renderizza l'errore (resource con
 * loadUsage che ha fallito — es. token mancante).
 */
export async function resolveUsageProbes(
  rows: ReadonlyArray<CapacityRow>,
): Promise<ResourceUsageMap> {
  const tasks: Array<{
    key: string;
    promise: Promise<
      CapacityUsageProbe | CapacityUsageProbe[] | { error: string }
    >;
  }> = [];

  for (const row of rows) {
    for (const res of row.profile.resources) {
      if (!res.loadUsage) continue;
      const key = resourceUsageKey(row.id, res.name);
      const promise = (async () => {
        try {
          const mod = await res.loadUsage!();
          return await mod.default();
        } catch (err) {
          return {
            error: err instanceof Error ? err.message : "probe_load_failed",
          };
        }
      })();
      tasks.push({ key, promise });
    }
  }

  const settled = await Promise.allSettled(tasks.map((t) => t.promise));
  const map: ResourceUsageMap = {};
  for (let i = 0; i < tasks.length; i++) {
    const result = settled[i];
    if (result.status === "fulfilled") {
      // Normalizza singolo probe → array di 1. Lascia { error } passare.
      const value = result.value;
      if (value && typeof value === "object" && "error" in value) {
        map[tasks[i].key] = value;
      } else if (Array.isArray(value)) {
        map[tasks[i].key] = value;
      } else {
        map[tasks[i].key] = [value as CapacityUsageProbe];
      }
    } else {
      map[tasks[i].key] = {
        error:
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason),
      };
    }
  }
  return map;
}
