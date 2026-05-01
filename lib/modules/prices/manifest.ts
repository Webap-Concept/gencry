// lib/modules/prices/manifest.ts
// Manifest del modulo Prices Engine. Esporta:
//  - le voci nav che vanno sotto "Modules" nell'admin
//  - i cron job che servono per l'ingestion
//  - la permission RBAC base
//
// Il modulo NON espone un userTab perché non aggiunge dati per-utente
// (questa è prerogativa del modulo "social" — bio, post count, ecc.).
import type { ModuleManifest } from "@/lib/modules/types";

export const PRICES_MODULE: ModuleManifest = {
  slug: "prices",
  label: "Prices Engine",
  description: "Crypto prices ingestion pipeline.",
  version: "1.0.0",
  icon: "LineChart",
  permission: "modules:prices",
  permissionLabel: "Access Prices Engine module",
  // extraPermissions: [...] — al momento basta uno, la sezione admin è
  //   pure read+write. Quando avremo viste read-only / coin moderation
  //   aggiungeremo permessi più granulari.
  navChildren: [
    {
      key: "prices-overview",
      href: "/admin/modules/prices",
      label: "Health",
      icon: "Activity",
      permission: "modules:prices",
      // exact: il path è prefisso di /coins e /settings, senza exact tutte
      // le sottosezioni accenderebbero anche Health.
      exact: true,
    },
    {
      key: "prices-coins",
      href: "/admin/modules/prices/coins",
      label: "Coins Registry",
      icon: "Coins",
      permission: "modules:prices",
    },
    {
      key: "prices-settings",
      href: "/admin/modules/prices/settings",
      label: "Settings",
      icon: "Settings",
      permission: "modules:prices",
    },
  ],
  cronJobs: [
    { path: "/api/cron/modules/prices/sync",     schedule: "*/5 * * * *" },
    { path: "/api/cron/modules/prices/snapshot", schedule: "*/5 * * * *" },
    { path: "/api/cron/modules/prices/cleanup",  schedule: "0 3 * * *"   },
  ],
};
