import "server-only";
// lib/modules/scaling-triggers-registry.ts
//
// Registry server-only dei scaling triggers per-modulo. Pattern identico
// a `sitemap-registry.ts`: ogni modulo dichiara i suoi trigger in un
// file `scaling-triggers-manifest.ts` server-only, e questo registry li
// importa direttamente. Il manifest principale del modulo NON sa nulla
// dei trigger (così la catena di import del manifest resta client-safe).
//
// Per aggiungere trigger a un nuovo modulo:
//   1. Crea `lib/modules/<modulo>/scaling-triggers-manifest.ts` con
//      `default export ScalingTrigger[]` + `import "server-only"`.
//   2. Aggiungilo qui sotto in `MODULE_SCALING_TRIGGERS` con
//      `{ slug, triggers: postsTriggers }`.
//
// Cross-cutting triggers (DAU, DB pool, Upstash bandwidth) vivono in
// `lib/admin/scaling-triggers/core.ts` e vengono aggregati da
// `lib/admin/scaling-triggers/collect.ts`.

import type { ScalingTrigger } from "./types";
import postsTriggers from "./posts/scaling-triggers-manifest";

export type ModuleScalingTriggersEntry = {
  slug: string;
  triggers: ScalingTrigger[];
};

export const MODULE_SCALING_TRIGGERS: ReadonlyArray<ModuleScalingTriggersEntry> = [
  { slug: "posts", triggers: postsTriggers },
];
