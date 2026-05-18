// lib/modules/notifications/manifest.ts
//
// Manifest del modulo Notifications (end-user social notifications).
// Distinto dal sistema core `lib/notifications/` che gestisce le
// notifiche admin di sistema (failure cron, secret rotation, ecc.).
//
// Architettura zero-latency: il fanout dal `posts_outbox` alla tabella
// `notifications` avviene via trigger plpgsql (M_notifications_001) —
// niente cron worker, niente consumer applicativo. La UI client
// sottoscrive Supabase Realtime per push istantaneo del badge unread.
import type { ModuleManifest } from "@/lib/modules/types";

export const NOTIFICATIONS_MODULE: ModuleManifest = {
  slug: "notifications",
  label: "Notifications",
  description:
    "End-user notifications for social events (reactions, comments, mentions, reposts). Zero-latency fanout via DB trigger from posts_outbox.",
  version: "0.1.0", // 0.1.0 = scaffold 2026-05-18 (schema + trigger + admin scaffold). 1.0.0 quando UI utente + counter sidebar saranno live.
  icon: "Bell",
  permission: "modules:notifications",
  permissionLabel: "Access Notifications module",
  navChildren: [
    {
      key: "notifications-overview",
      href: "/modules/notifications",
      label: "Overview",
      icon: "Activity",
      permission: "modules:notifications",
      exact: true,
    },
    {
      key: "notifications-settings",
      href: "/modules/notifications/settings",
      label: "Settings",
      icon: "Settings",
      permission: "modules:notifications",
    },
    {
      key: "notifications-architecture",
      href: "/modules/notifications/architecture",
      label: "Architettura",
      icon: "BookOpen",
      permission: "modules:notifications",
    },
  ],
  // Niente cron jobs: il fanout è gestito dal trigger DB. Eventuale
  // cleanup retention (DELETE notifications WHERE created_at <
  // now()-modules.notifications.retention_days) arriverà come job in PR-3
  // quando produrremo volume sufficiente da giustificarlo.
  cronJobs: [],
};
