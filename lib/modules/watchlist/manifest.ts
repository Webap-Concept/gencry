// lib/modules/watchlist/manifest.ts
//
// Manifest del modulo Watchlist. Espone:
//   - voci nav admin (Overview + Architecture)
//   - permission RBAC base `modules:watchlist` (UI admin)
//
// CRUD lato utente sulle proprie watchlist non passa da RBAC: il gate
// e' AUTH + ownership check applicativo (vedi actions.ts).
//
// Niente cronJobs in V1 (perf 30g calcolato on-demand con cache Redis).
import type { ModuleManifest } from "@/lib/modules/types";
import { WATCHLIST_PERMISSION } from "./permissions";

export const WATCHLIST_MODULE: ModuleManifest = {
  slug: "watchlist",
  label: "Watchlist",
  description:
    "Watchlist di crypto create dall'utente: tracking di portafogli simulati con perf 30g e condivisione pubblica.",
  version: "0.1.0",
  icon: "Bookmark",
  permission: WATCHLIST_PERMISSION,
  permissionLabel: "Access Watchlist module",
  navChildren: [
    {
      key: "watchlist-overview",
      href: "/modules/watchlist",
      label: "Overview",
      icon: "Activity",
      permission: WATCHLIST_PERMISSION,
      exact: true,
    },
    {
      key: "watchlist-settings",
      href: "/modules/watchlist/settings",
      label: "Impostazioni",
      icon: "Settings",
      permission: WATCHLIST_PERMISSION,
    },
    {
      key: "watchlist-architecture",
      href: "/modules/watchlist/architecture",
      label: "Architettura",
      icon: "BookOpen",
      permission: WATCHLIST_PERMISSION,
    },
  ],
  cronJobs: [],
};
