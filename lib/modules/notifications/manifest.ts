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
import type { CapacityProfile, ModuleManifest } from "@/lib/modules/types";

// Achievement V1 (M_notifications_002, decisione product 2026-05-26):
// niente email per ogni azione (rumore → utente disabilita), solo email
// quando il contenuto raggiunge milestone (first like, viral burst).
// Strings EN-only by convention (admin-facing).
const ACHIEVEMENTS_CAPACITY: CapacityProfile = {
  scope: "achievements",
  label: "Achievements (milestone events)",
  currentTier: "alpha",
  resources: [
    {
      name: "Trigger DB inline check",
      plan: "Built-in (no extra infra)",
      limits: [
        "1 extra SELECT on posts + 4 SELECTs on app_settings per reaction insert",
        "PK index lookups, ~0.1ms overhead per insert",
        "0 polling cron — push pattern via posts_outbox",
      ],
      upgradeAt: "When achievement rules grow beyond ~10 — consider caching settings via plpgsql GUC",
      upgradePath:
        "Cache settings in plpgsql custom GUC variable refreshed every N minutes; alternatively move achievement detection to Edge Function consumer of posts_outbox.",
    },
  ],
  tunables: [
    { key: "modules.notifications.achievements.viral_likes_enabled",           label: "Viral-likes enabled (true/false)" },
    { key: "modules.notifications.achievements.viral_likes_threshold",         label: "Viral-likes threshold (reactions)" },
    { key: "modules.notifications.achievements.viral_likes_window_hours",      label: "Viral-likes window (hours)" },
    { key: "modules.notifications.achievements.viral_comments_enabled",        label: "Viral-comments enabled (true/false)" },
    { key: "modules.notifications.achievements.viral_comments_threshold",      label: "Viral-comments threshold (comments)" },
    { key: "modules.notifications.achievements.viral_comments_window_hours",   label: "Viral-comments window (hours)" },
    { key: "modules.notifications.achievements.viral_reposts_enabled",         label: "Viral-reposts enabled (true/false)" },
    { key: "modules.notifications.achievements.viral_reposts_threshold",       label: "Viral-reposts threshold (reposts)" },
    { key: "modules.notifications.achievements.viral_reposts_window_hours",    label: "Viral-reposts window (hours)" },
  ],
  presets: [
    {
      id: "alpha",
      label: "Alpha (<100 MAU)",
      description: "Generous: very low viral thresholds so we see notifications fire during dev/early users.",
      values: {
        "modules.notifications.achievements.viral_likes_enabled": "true",
        "modules.notifications.achievements.viral_likes_threshold": "10",
        "modules.notifications.achievements.viral_likes_window_hours": "48",
        "modules.notifications.achievements.viral_comments_enabled": "true",
        "modules.notifications.achievements.viral_comments_threshold": "5",
        "modules.notifications.achievements.viral_comments_window_hours": "48",
        "modules.notifications.achievements.viral_reposts_enabled": "true",
        "modules.notifications.achievements.viral_reposts_threshold": "2",
        "modules.notifications.achievements.viral_reposts_window_hours": "48",
      },
    },
    {
      id: "beta",
      label: "Beta (100-1k MAU)",
      description: "Default production: realistic milestones for early-stage community across reactions, comments and reposts.",
      values: {
        "modules.notifications.achievements.viral_likes_enabled": "true",
        "modules.notifications.achievements.viral_likes_threshold": "50",
        "modules.notifications.achievements.viral_likes_window_hours": "24",
        "modules.notifications.achievements.viral_comments_enabled": "true",
        "modules.notifications.achievements.viral_comments_threshold": "10",
        "modules.notifications.achievements.viral_comments_window_hours": "24",
        "modules.notifications.achievements.viral_reposts_enabled": "true",
        "modules.notifications.achievements.viral_reposts_threshold": "5",
        "modules.notifications.achievements.viral_reposts_window_hours": "24",
      },
    },
    {
      id: "growth",
      label: "Growth (1k-10k MAU)",
      description: "Higher viral bars — at this scale daily engagement is the norm, save the email for real bursts.",
      values: {
        "modules.notifications.achievements.viral_likes_enabled": "true",
        "modules.notifications.achievements.viral_likes_threshold": "150",
        "modules.notifications.achievements.viral_likes_window_hours": "12",
        "modules.notifications.achievements.viral_comments_enabled": "true",
        "modules.notifications.achievements.viral_comments_threshold": "30",
        "modules.notifications.achievements.viral_comments_window_hours": "12",
        "modules.notifications.achievements.viral_reposts_enabled": "true",
        "modules.notifications.achievements.viral_reposts_threshold": "15",
        "modules.notifications.achievements.viral_reposts_window_hours": "12",
      },
    },
    {
      id: "scale",
      label: "Scale (10k+ MAU)",
      description: "Only notify for truly significant bursts at mass adoption.",
      values: {
        "modules.notifications.achievements.viral_likes_enabled": "true",
        "modules.notifications.achievements.viral_likes_threshold": "500",
        "modules.notifications.achievements.viral_likes_window_hours": "6",
        "modules.notifications.achievements.viral_comments_enabled": "true",
        "modules.notifications.achievements.viral_comments_threshold": "100",
        "modules.notifications.achievements.viral_comments_window_hours": "6",
        "modules.notifications.achievements.viral_reposts_enabled": "true",
        "modules.notifications.achievements.viral_reposts_threshold": "50",
        "modules.notifications.achievements.viral_reposts_window_hours": "6",
      },
    },
  ],
};

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
      key: "notifications-email",
      href: "/modules/notifications/email",
      label: "Email",
      icon: "Mail",
      permission: "modules:notifications",
    },
    {
      key: "notifications-cron",
      href: "/modules/notifications/cron",
      label: "Cron",
      icon: "Clock",
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
  cronJobs: [
    {
      jobname: "modules-notifications-achievement-email",
      path: "/api/cron/modules/notifications/achievement-email",
      schedule: "*/20 * * * *",
      label: "Achievement email dispatcher",
      description:
        "Scansiona notifications.email_sent_at IS NULL + type IN (achievement.*) ogni 20 min. Render renderer del modulo + sendEmail via Resend. Skip se modules.notifications.email_send_enabled=false. Grace window modules.notifications.email_grace_seconds (default 30s) per evitare race col fanout trigger.",
      purpose:
        "Consegna effettiva via email delle notifiche achievement viral_*. Default-on V1; opt-out per-user arriverà con PR-4 (notifications_preferences).",
    },
    {
      jobname: "modules-notifications-retention-cleanup",
      path: "/api/cron/modules/notifications/retention-cleanup",
      schedule: "30 4 * * *",
      label: "Notifications retention cleanup",
      description:
        "Daily DELETE batched (5k row/batch, max 20 batch = 100k row/run) delle notifications con created_at piu' vecchio di modules.notifications.retention_days (default 180). Range valido [7, 3650]; fuori range = skip senza errore. Backlog drena nei run successivi.",
      purpose:
        "Mantiene la tabella notifications bounded. Notifiche sociali lette/vecchie non hanno valore probatorio (non sono audit log); valore default 6 mesi e' coerente con le big social. Per allungare a piu' anni, alzare retention_days in /admin/modules/notifications.",
    },
  ],
  capacityProfiles: [ACHIEVEMENTS_CAPACITY],
};
