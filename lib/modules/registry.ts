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
import { ONBOARDING_MODULE } from "./onboarding/manifest";
import { POSTS_MODULE } from "./posts/manifest";
import { NOTIFICATIONS_MODULE } from "./notifications/manifest";
import { NEWS_MODULE } from "./news/manifest";
import { SEEDERS_MODULE } from "./seeders/manifest";
import { SOCIAL_GRAPH_MODULE } from "./social-graph/manifest";
import { WATCHLIST_MODULE } from "./watchlist/manifest";

// Side-effect imports: registrano estensioni del CMS page-editor
// (campi custom aggiuntivi + slug resolvers). Vedi
// `lib/cms/page-template-extensions.ts` per il pattern del registry.
// Aggiungere qui ogni futuro modulo che vuole estendere il page-editor.
// (Nessun modulo registrato al momento — il news cms-extension è
// stato droppato col refactor news-categories-as-cms-pages: la
// categoria ora è data dal parent_id CMS, niente custom field.)

export const INSTALLED_MODULES: ModuleManifest[] = [
  PRICES_MODULE,
  ONBOARDING_MODULE,
  POSTS_MODULE,
  NOTIFICATIONS_MODULE,
  NEWS_MODULE,
  SEEDERS_MODULE,
  SOCIAL_GRAPH_MODULE,
  WATCHLIST_MODULE,
];

/** Helper: il modulo con questo slug è installato? */
export function isModuleInstalled(slug: string): boolean {
  return INSTALLED_MODULES.some((m) => m.slug === slug);
}

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
