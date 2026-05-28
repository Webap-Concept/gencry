// lib/modules/social-graph/manifest.ts
//
// Manifest del modulo Social Graph. Esporta:
//  - voci nav admin (Overview + Architecture)
//  - permission RBAC base `modules:social-graph`
//
// Il modulo NON espone cron jobs (no maintenance schedulata in V1) ne
// userTab (la pagina utenti core non aggiunge un tab "follows"; la lista
// followers/following vive lato pubblico su /u/[username]/followers).
import type { ModuleManifest } from "@/lib/modules/types";
import { SOCIAL_GRAPH_PERMISSION } from "./permissions";

export const SOCIAL_GRAPH_MODULE: ModuleManifest = {
  slug: "social-graph",
  label: "Social Graph",
  description: "Following relationships between users (powers the Home feed).",
  version: "0.1.0",
  icon: "Users",
  permission: SOCIAL_GRAPH_PERMISSION,
  permissionLabel: "Access Social Graph module",
  navChildren: [
    {
      key: "social-graph-overview",
      href: "/modules/social-graph",
      label: "Overview",
      icon: "Activity",
      permission: SOCIAL_GRAPH_PERMISSION,
      exact: true,
    },
    {
      key: "social-graph-architecture",
      href: "/modules/social-graph/architecture",
      label: "Architettura",
      icon: "BookOpen",
      permission: SOCIAL_GRAPH_PERMISSION,
    },
  ],
  cronJobs: [],
};
