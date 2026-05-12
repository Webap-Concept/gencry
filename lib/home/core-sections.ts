// lib/home/core-sections.ts
//
// Sezioni del CORE per la home loggata. Per ora contiene solo mockup
// placeholder per visualizzare lo scaffold 3-colonne; verranno sostituiti
// dalle sezioni reali quando i moduli arrivano.
//
// **NON aggiungere qui sezioni di moduli.** Ogni modulo esporta le sue
// in `lib/modules/<slug>/home-sections.ts` e il registry centrale
// (`lib/home/registry.ts`) le compone con le entry di questo file.
//
// Quando si vorrà mettere una sezione "core" non-modulare (es. un
// welcome onboarding per utenti nuovi, un banner di sistema permanente),
// dichiararla qui sotto come oggetto HomeSection.

import { RailAdPlaceholder } from "@/components/feed/RailAdPlaceholder";
import type { HomeSection } from "./types";

export const CORE_HOME_SECTIONS: HomeSection[] = [
  // Right rail — mockup pubblicità. Da rimuovere quando arriverà la vera
  // entry sponsor / widget.
  {
    key: "core.rail.ad-placeholder",
    slot: "home.rail.top",
    order: 10,
    Component: RailAdPlaceholder,
  },
];
