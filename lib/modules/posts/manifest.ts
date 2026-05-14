// lib/modules/posts/manifest.ts
// Manifest del modulo Posts (social feed).
//
// Scope PR-1: solo registrazione del modulo (slug, label, permission base
// e extra `.moderate`). Niente navChildren ancora: le route admin
// (/admin/modules/posts/...) arriveranno con PR-8 (moderation page). Niente
// cronJobs: arrivano con PR-6 (orphan-media cleanup, link-preview refresh)
// e PR-7 (outbox retention).
//
// Design completo del modulo: vedi memory project_module_posts_architecture.
import type { ModuleManifest } from "@/lib/modules/types";

export const POSTS_MODULE: ModuleManifest = {
  slug: "posts",
  label: "Posts",
  description: "Social feed: composer, reactions, comments, reposts, bookmarks, moderation.",
  version: "0.1.0", // bump a 1.0.0 quando PR-1→PR-9 saranno tutte in main
  icon: "MessageSquare",
  permission: "modules:posts",
  permissionLabel: "Access Posts module",
  extraPermissions: [
    {
      key: "modules:posts.moderate",
      label: "Moderate posts",
      description: "Soft-delete posts, manage reports queue (NOT auto-granted to admin).",
    },
  ],
  navChildren: [
    {
      key: "posts-overview",
      href: "/modules/posts",
      label: "Overview",
      icon: "Activity",
      permission: "modules:posts",
      exact: true,
    },
    {
      key: "posts-settings",
      href: "/modules/posts/settings",
      label: "Settings",
      icon: "Settings",
      permission: "modules:posts",
    },
  ],
  cronJobs: [
    {
      jobname: "modules-posts-orphan-media-cleanup",
      path: "/api/cron/modules/posts/cleanup-orphan-media",
      schedule: "0 3 * * *",
      label: "Posts Orphan Media Cleanup",
      description:
        "Deletes posts_media rows that were uploaded to R2 but never attached to a published post (e.g. user closed the tab during compose). DELETEs R2 objects (original + thumb + full variants) + DB row.",
      purpose:
        "Closes the 'hard navigation' gap where the in-component cleanup couldn't run. Keeps R2 storage bounded.",
    },
    {
      jobname: "modules-posts-outbox-cleanup",
      path: "/api/cron/modules/posts/cleanup-outbox",
      schedule: "0 4 * * *",
      label: "Posts Outbox Cleanup",
      description:
        "Removes posts_outbox rows whose processed_at is older than modules.posts.outbox_retention_days (default 30d).",
      purpose:
        "Keeps the outbox table bounded after the notifications consumer marks events as processed.",
    },
  ],
};
