// lib/modules/registry.ts
// Registro dei moduli installati.
//
// Per "installare" un modulo: importa il suo manifest e aggiungilo
// all'array INSTALLED_MODULES. Il core leggerà:
//   - admin-nav.ts → costruisce la voce "Modules" dai navChildren
//   - vercel.json  → (manuale per ora) raccoglie i cronJobs
//   - pagina utente core → renderizza i userTab
//
// Per "disinstallare" un modulo: togli la riga + esegui la migration
// M_<slug>_999_uninstall.sql sul DB.
import type { ModuleManifest } from "./types";
import { PRICES_MODULE } from "./prices/manifest";

export const INSTALLED_MODULES: ModuleManifest[] = [PRICES_MODULE];

/** Helper: trova un modulo per slug (utile in route handler / RBAC) */
export function getModule(slug: string): ModuleManifest | undefined {
  return INSTALLED_MODULES.find((m) => m.slug === slug);
}

/** Helper: tutte le permission RBAC dei moduli installati */
export function getAllModulePermissions(): string[] {
  return INSTALLED_MODULES.map((m) => m.permission);
}

/** Helper: tutti gli userTab esposti dai moduli (per la pagina utenti core) */
export function getAllUserTabs() {
  return INSTALLED_MODULES.flatMap((m) =>
    m.userTab
      ? [{ ...m.userTab, moduleSlug: m.slug, modulePermission: m.permission }]
      : [],
  );
}
