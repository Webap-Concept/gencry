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
      href: "/modules/prices",
      label: "Overview",
      icon: "Activity",
      permission: "modules:prices",
      // exact: il path è prefisso di /coins e /settings, senza exact tutte
      // le sottosezioni accenderebbero anche Overview.
      exact: true,
    },
    {
      key: "prices-coins",
      href: "/modules/prices/coins",
      label: "Coins Registry",
      icon: "Coins",
      permission: "modules:prices",
    },
    {
      key: "prices-cron",
      href: "/modules/prices/cron",
      label: "Cron Jobs",
      icon: "Clock",
      permission: "modules:prices",
    },
    {
      key: "prices-settings",
      href: "/modules/prices/settings",
      label: "Settings",
      icon: "Settings",
      permission: "modules:prices",
    },
    {
      key: "prices-architecture",
      href: "/modules/prices/architecture",
      label: "Architettura",
      icon: "BookOpen",
      permission: "modules:prices",
    },
  ],
  cronJobs: [
    {
      jobname: "modules-prices-sync",
      path: "/api/cron/modules/prices/sync",
      schedule: "*/5 * * * *",
      label: "Prices Sync",
      description: "Fetches the latest prices for the active coin universe from CoinGecko / fallback sources and updates the live KV cache.",
      purpose: "Keeps live prices fresh on the frontend (markets table, watchlists, charts).",
    },
    {
      jobname: "modules-prices-snapshot",
      path: "/api/cron/modules/prices/snapshot",
      schedule: "*/5 * * * *",
      label: "Prices Snapshot",
      description: "Persists a periodic snapshot of prices into the time-series table for historical charts.",
      purpose: "Powers historical charts and delta computations (24h, 7d).",
    },
    {
      jobname: "modules-prices-cleanup",
      path: "/api/cron/modules/prices/cleanup",
      schedule: "0 3 * * *",
      label: "Prices Cleanup",
      description: "Deletes price snapshots older than the configured retention window from the time-series table.",
      purpose: "Keeps DB size bounded and respects the retention policy in module settings.",
    },
  ],
};
