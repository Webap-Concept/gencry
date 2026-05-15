// lib/modules/seeders/manifest.ts
//
// Modulo "Seeders" — popola il DB con utenti e contenuti demo per dare
// vita al sito al lancio (feed, explore, trending non sembrano vuoti)
// e per facilitare il testing manuale dei flussi (block, report, ecc.).
//
// NON è un modulo dev-only: i demo users sono utenti reali nel DB con
// pattern email `seed-{ulid}@seed.<APP_DOMAIN>` (sotto-dominio non
// raggiungibile, accounts non loggabili — password = bcrypt(uuid)).
// Indistinguibili dal frontend per i visitatori.
//
// Sicurezza:
//   - permission `modules:seeders` NON auto-granted ad admin standard
//     (solo SuperAdmin per default). Va attribuita esplicitamente.
//   - Cleanup lockdown su pattern email → impossibile cancellare real
//     users anche con bug nel UI.
//
// Estensibilità: vedi `registry.ts` (SeederContributor[]). Quando arriva
// un nuovo modulo (es. comments, predictions), aggiunge il suo
// contributor lì senza toccare il core del seeder.
import type { ModuleManifest } from "@/lib/modules/types";

export const SEEDERS_MODULE: ModuleManifest = {
  slug: "seeders",
  label: "Seeders",
  description:
    "Popola il sito con utenti e contenuti demo. Da usare al lancio per evitare un feed vuoto, e in qualsiasi momento per testing manuale.",
  version: "0.1.0",
  icon: "Sprout",
  permission: "modules:seeders",
  permissionLabel: "Run seeders",
  navChildren: [
    {
      key: "seeders-overview",
      href: "/modules/seeders",
      label: "Overview",
      icon: "Sprout",
      permission: "modules:seeders",
      exact: true,
    },
  ],
  cronJobs: [],
};
