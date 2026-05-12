// lib/home/core-sections.ts
//
// Sezioni del CORE per la home loggata. Vuoto al lancio del registry
// (2026-05-12): la home è uno scaffold pronto ad accogliere le sezioni
// che arriveranno dai moduli social (posts, prices highlights,
// predictions, ecc).
//
// **NON aggiungere qui sezioni di moduli.** Ogni modulo esporta le sue
// in `lib/modules/<slug>/home-sections.ts` e il registry centrale
// (`lib/home/registry.ts`) le compone con le entry di questo file.
//
// Quando si vorrà mettere una sezione "core" non-modulare (es. un
// welcome onboarding per utenti nuovi, un banner di sistema permanente),
// dichiararla qui sotto come oggetto HomeSection.

import type { HomeSection } from "./types";

export const CORE_HOME_SECTIONS: HomeSection[] = [];
