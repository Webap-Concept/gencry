import "server-only";
// lib/admin/scaling-triggers/collect.ts
//
// Aggregator dei scaling triggers: unisce i CORE_SCALING_TRIGGERS
// cross-cutting + tutti gli scalingTriggers dichiarati nei manifest
// dei moduli installati. Output: array piatto pronto per il widget.
//
// Nessuna probe viene chiamata qui — il widget invoca le `loadMeasure`
// dinamicamente per ogni trigger via Suspense, così un probe lento o
// errato non blocca gli altri.
import { MODULE_SCALING_TRIGGERS } from "@/lib/modules/scaling-triggers-registry";
import type { ScalingTrigger } from "@/lib/modules/types";
import { CORE_SCALING_TRIGGERS } from "./core";

export type ScalingTriggerWithSource = ScalingTrigger & {
  /** "core" oppure slug del modulo proprietario. Mostrato in UI come
   *  badge "Posts", "Notifications", ecc. */
  source: string;
};

/**
 * Raccoglie tutti i trigger. Idempotente. Niente probe call qui:
 * solo metadata.
 */
export function collectAllScalingTriggers(): ScalingTriggerWithSource[] {
  const out: ScalingTriggerWithSource[] = [];

  for (const trigger of CORE_SCALING_TRIGGERS) {
    out.push({ ...trigger, source: "core" });
  }

  for (const entry of MODULE_SCALING_TRIGGERS) {
    for (const trigger of entry.triggers) {
      out.push({ ...trigger, source: entry.slug });
    }
  }

  return out;
}
