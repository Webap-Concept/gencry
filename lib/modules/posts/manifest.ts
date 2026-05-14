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
  navChildren: [],
  cronJobs: [],
};
