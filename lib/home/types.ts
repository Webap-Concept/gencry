// lib/home/types.ts
//
// Tipi del registry della home loggata. Vedi
// project_home_slot_registry.md per il razionale dell'architettura.

import type { JSX } from "react";

/**
 * Slot disponibili per le sezioni della home loggata.
 *
 * - `home.hero`        — sopra il feed (greeting, banner re-engagement)
 * - `home.main.top`    — sopra il feed (ticker, moments, stories)
 * - `home.main`        — feed verticale (posts, news, mentions)
 * - `home.main.bottom` — sotto il feed (load-more, end-state, recommendation)
 * - `home.rail.top`    — right rail top (sponsor, trending)
 * - `home.rail.middle` — right rail middle (suggested follows, companies)
 * - `home.rail.bottom` — right rail bottom (legal footer)
 *
 * Aggiungere uno slot nuovo qui costa poco — ma serve disciplina: ogni
 * slot deve avere uno scopo chiaro, evitare slot "miscellaneous".
 */
export type HomeSlot =
  | "home.hero"
  | "home.main.top"
  | "home.main"
  | "home.main.bottom"
  | "home.rail.top"
  | "home.rail.middle"
  | "home.rail.bottom";

/**
 * Una sezione registrata in uno slot della home.
 *
 * `Component` è una RSC: ogni sezione fa il suo server fetch internamente
 * (la home non passa dati centralmente — pattern Twitter web). `isEnabled`
 * permette di gatare con feature flag, abilitazione modulo, ruolo utente,
 * A/B test, ecc. — viene chiamato per ogni request, quindi mantienilo
 * leggero (idealmente un read da getAppSettings cached).
 *
 * `Skeleton` è OBBLIGATORIO: viene usato come `<Suspense fallback>` durante
 * il caricamento iniziale della sezione, dando un placeholder fedele alla
 * card finale (niente più salti di layout). Il TypeScript enforce-a la
 * dichiarazione esplicita — anche le sezioni "sincronee" (mockup, statiche)
 * devono passarne uno, anche se non si vedrà mai (è coerenza architetturale).
 */
export interface HomeSection {
  /** Identificatore univoco — usato come React key e per debug/telemetry. */
  key: string;
  /** Slot in cui questa sezione appare. */
  slot: HomeSlot;
  /** Ordine in-slot (numeri "10/20/30…" lasciano spazio per inserzioni future). */
  order: number;
  /** RSC che renderizza la sezione (incluso il fetch dati). */
  Component: () => Promise<JSX.Element> | JSX.Element;
  /** Skeleton client-friendly per il fallback di <Suspense>. Obbligatorio. */
  Skeleton: () => JSX.Element;
  /**
   * Gate opzionale; se omesso = sempre visibile. Chiamato OGNI request
   * (resolveSlot gira a ogni page load).
   *
   * REGOLA: l'implementazione DEVE leggere da una sorgente cached per
   * request — `getAppSettings()` è già `React.cache()`-ata, quindi una
   * lettura ad app_settings è 1 sola query DB indipendentemente da
   * quanti gate la chiamano. NIENTE query DB custom dentro `isEnabled`:
   * con 5+ moduli che registrano sezioni, si trasforma in N round-trip
   * per page load.
   *
   * Pattern raccomandato: usare l'helper `isEnabledByFlag()` esportato
   * da `lib/home/gates.ts` quando il gate è "boolean da app_settings".
   * Per gate più complessi (es. dipende da ruolo utente), implementare
   * a mano sempre via `getAppSettings()` / `getUser()` (anche getUser
   * è cached per request).
   */
  isEnabled?: () => Promise<boolean> | boolean;
}
