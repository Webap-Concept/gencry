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
import type { CapacityProfile, ModuleManifest } from "@/lib/modules/types";

// Capacity profiles for the Posts module. 1 profile per "autonomous
// feature" (see memory feedback_capacity_profile_pattern). The admin UI
// of each tab reads the profile via `scope` lookup.
//
// Strings here are intentionally EN-only (no i18n lookup): these are
// admin/dev-facing technical notes, not user-facing UI copy.
//
// Scopes defined:
//   - "comments" → live mode + reply prefetch + cache TTL
//   - "rate-limits" → Upstash sliding window per post/reaction/etc (placeholder, waiting for Upstash + dedicated admin form)
//   - "retention" → outbox/orphan-media/deleted grace days (placeholder)
//   - "media" → R2 (max images per post, body length, link preview cache) (placeholder)

const COMMENTS_CAPACITY: CapacityProfile = {
  scope: "comments",
  label: "Comments thread",
  currentTier: "alpha",
  resources: [
    {
      name: "Supabase Realtime (Broadcast)",
      plan: "Free",
      limits: [
        "200 concurrent connections",
        "2M msg/month",
        "100 msg/sec per connection",
      ],
      upgradeAt: "500 simultaneous viewers or concurrent conn > 70% of limit",
      upgradePath:
        "Supabase Pro (500 conn) OR swap to Ably/Pusher via the hookable service comments-realtime.ts",
      docsUrl: "https://supabase.com/docs/guides/realtime",
    },
    {
      name: "Supabase Postgres (posts_comments)",
      plan: "Free",
      limits: [
        "500MB DB share",
        "200 concurrent connections via pool",
      ],
      upgradeAt: "p95 query > 100ms (M_posts_007 partial indexes cover the fan-out)",
      upgradePath:
        "Upgrade to Supabase Pro ($25/mo) — unlocks 8GB DB and 500 conn",
      docsUrl: "https://supabase.com/pricing",
    },
    {
      name: "Upstash KV (feed cache) — CORE",
      plan: "Free / pay-as-you-go",
      limits: [
        "10k req/day (free tier)",
        "256MB max DB (free)",
        "TTL 60s on posts:feed:* (feed-cache.ts)",
      ],
      upgradeAt: "Throughput > 10k req/day or miss rate > 50%",
      upgradePath:
        "Pay-as-you-go Upstash ~$10/mo at 1k MAU. Credentials at CORE level (upstash_redis_rest_url/_token) — single setup in /admin/services/redis, reused cross-module.",
      docsUrl: "https://upstash.com/pricing",
    },
  ],
  tunables: [
    { key: "modules.posts.comments.live_mode_post_page",   label: "Live mode — /post/[id]" },
    { key: "modules.posts.comments.live_mode_feed",        label: "Live mode — feed inline" },
    { key: "modules.posts.comments.poll_interval_seconds", label: "Poll interval (sec)" },
    { key: "modules.posts.comments.cache_ttl_seconds",     label: "Cache TTL (sec)" },
    { key: "modules.posts.comments.max_body_length",       label: "Max body length (char)" },
    { key: "modules.posts.comments.replies_initial_count", label: "Reply prefetch per root" },
  ],
  presets: [
    {
      id: "alpha",
      label: "Alpha (<100 MAU)",
      description: "Aggressive realtime, no aggressive caching — immediate feedback for early-stage closure.",
      values: {
        "modules.posts.comments.live_mode_post_page": "subscribe",
        "modules.posts.comments.live_mode_feed": "subscribe",
        "modules.posts.comments.poll_interval_seconds": "20",
        "modules.posts.comments.cache_ttl_seconds": "30",
        "modules.posts.comments.replies_initial_count": "3",
      },
    },
    {
      id: "beta",
      label: "Beta (100-1k MAU)",
      description: "Subscribe on the page, poll on the feed to avoid saturating realtime conns. Slightly more aggressive cache.",
      values: {
        "modules.posts.comments.live_mode_post_page": "subscribe",
        "modules.posts.comments.live_mode_feed": "poll",
        "modules.posts.comments.poll_interval_seconds": "30",
        "modules.posts.comments.cache_ttl_seconds": "60",
        "modules.posts.comments.replies_initial_count": "3",
      },
    },
    {
      id: "growth",
      label: "Growth (1k-10k MAU)",
      description: "Realtime only on the dedicated page, poll everywhere else, long cache. Also worth enabling Upstash KV + Supabase Pro.",
      values: {
        "modules.posts.comments.live_mode_post_page": "subscribe",
        "modules.posts.comments.live_mode_feed": "poll",
        "modules.posts.comments.poll_interval_seconds": "45",
        "modules.posts.comments.cache_ttl_seconds": "120",
        "modules.posts.comments.replies_initial_count": "2",
      },
    },
    {
      id: "scale",
      label: "Scale (10k+ MAU)",
      description: "Realtime off by default — banner via long poll. Aggressive cache. Requires single-channel pooling (future V2) + Upstash + Supabase Pro + proactive monitoring.",
      values: {
        "modules.posts.comments.live_mode_post_page": "poll",
        "modules.posts.comments.live_mode_feed": "off",
        "modules.posts.comments.poll_interval_seconds": "60",
        "modules.posts.comments.cache_ttl_seconds": "300",
        "modules.posts.comments.replies_initial_count": "2",
      },
    },
  ],
};

// Placeholder profiles — capacity declared today even if the dedicated
// admin forms do not exist yet (they live inside the general Settings
// tab or under the module page). When we add dedicated admin forms,
// they will use these profiles via scope lookup.

const RATE_LIMITS_CAPACITY: CapacityProfile = {
  scope: "rate-limits",
  label: "Rate limiting (anti-spam)",
  currentTier: "alpha",
  resources: [
    {
      name: "Upstash KV (sliding window) — CORE",
      plan: "Configured (shared cluster with feed-cache)",
      limits: ["10k req/day (free tier)", "V1 stub: services/rate-limit.ts returns ok=true"],
      upgradeAt: "Public signup opens → swap V2 sliding-window impl",
      upgradePath:
        "Pay-as-you-go Upstash ~$10/mo at 1k MAU — service rate-limit.ts is pass-through today, swap to Upstash sliding-window impl without touching callers. Credentials at CORE level — already configured in /admin/services/redis.",
      docsUrl: "https://upstash.com/pricing",
    },
  ],
  tunables: [
    { key: "modules.posts.rate_limit_post_per_hour",     label: "Posts per hour" },
    { key: "modules.posts.rate_limit_reaction_per_min",  label: "Reactions per min" },
    { key: "modules.posts.rate_limit_comment_per_min",   label: "Comments per min" },
    { key: "modules.posts.rate_limit_repost_per_hour",   label: "Reposts per hour" },
    { key: "modules.posts.rate_limit_report_per_hour",   label: "Reports per hour" },
    { key: "modules.posts.rate_limit_media_per_hour",    label: "Media uploads per hour" },
  ],
  presets: [
    {
      id: "alpha",
      label: "Alpha (<100 MAU)",
      description: "Permissive limits — early users behave legitimately, no spam.",
      values: {
        "modules.posts.rate_limit_post_per_hour": "10",
        "modules.posts.rate_limit_reaction_per_min": "60",
        "modules.posts.rate_limit_comment_per_min": "30",
        "modules.posts.rate_limit_repost_per_hour": "5",
        "modules.posts.rate_limit_report_per_hour": "5",
        "modules.posts.rate_limit_media_per_hour": "20",
      },
    },
    {
      id: "beta",
      label: "Beta (100-1k MAU)",
      description: "Slightly tighter limits on post/repost to avoid accidental flooding.",
      values: {
        "modules.posts.rate_limit_post_per_hour": "8",
        "modules.posts.rate_limit_reaction_per_min": "60",
        "modules.posts.rate_limit_comment_per_min": "30",
        "modules.posts.rate_limit_repost_per_hour": "5",
        "modules.posts.rate_limit_report_per_hour": "5",
        "modules.posts.rate_limit_media_per_hour": "20",
      },
    },
    {
      id: "growth",
      label: "Growth (1k-10k MAU)",
      description: "Realistic limits for public traffic: 5 posts/h is plenty for a real user and discourages bots.",
      values: {
        "modules.posts.rate_limit_post_per_hour": "5",
        "modules.posts.rate_limit_reaction_per_min": "40",
        "modules.posts.rate_limit_comment_per_min": "20",
        "modules.posts.rate_limit_repost_per_hour": "3",
        "modules.posts.rate_limit_report_per_hour": "5",
        "modules.posts.rate_limit_media_per_hour": "15",
      },
    },
    {
      id: "scale",
      label: "Scale (10k+ MAU)",
      description: "Tight limits + abuse monitoring. Consider captcha on write actions for new accounts.",
      values: {
        "modules.posts.rate_limit_post_per_hour": "5",
        "modules.posts.rate_limit_reaction_per_min": "30",
        "modules.posts.rate_limit_comment_per_min": "15",
        "modules.posts.rate_limit_repost_per_hour": "3",
        "modules.posts.rate_limit_report_per_hour": "3",
        "modules.posts.rate_limit_media_per_hour": "10",
      },
    },
  ],
};

const RETENTION_CAPACITY: CapacityProfile = {
  scope: "retention",
  label: "Retention & cleanup",
  currentTier: "alpha",
  resources: [
    {
      name: "Supabase Postgres (posts_outbox, soft-deleted posts)",
      plan: "Free",
      limits: ["500MB DB share"],
      upgradeAt: "outbox > 100k unprocessed rows or storage > 80%",
      upgradePath:
        "Increase cleanup cadence + reduce retention days. As a last resort, Supabase Pro.",
      docsUrl: "https://supabase.com/pricing",
    },
    {
      name: "Cloudflare R2 (orphan media)",
      plan: "Free",
      limits: ["10GB storage"],
      upgradeAt: "Storage > 8GB",
      upgradePath:
        "Daily orphan-media-cleanup cron + tighten grace hours.",
      docsUrl: "https://developers.cloudflare.com/r2/pricing/",
    },
  ],
  tunables: [
    { key: "modules.posts.outbox_retention_days",     label: "Outbox retention (days)" },
    { key: "modules.posts.orphan_media_grace_hours",  label: "Orphan media grace (hours)" },
    { key: "modules.posts.deleted_grace_days",        label: "Deleted post grace (days)" },
    { key: "modules.posts.link_preview_cache_days",   label: "Link preview cache (days)" },
  ],
  presets: [
    {
      id: "alpha",
      label: "Alpha (<100 MAU)",
      description: "Max retention for early debugging: outbox 45d, orphan 24h, link preview 30d.",
      values: {
        "modules.posts.outbox_retention_days": "45",
        "modules.posts.orphan_media_grace_hours": "24",
        "modules.posts.deleted_grace_days": "7",
        "modules.posts.link_preview_cache_days": "30",
      },
    },
    {
      id: "beta",
      label: "Beta (100-1k MAU)",
      description: "Balanced retention: outbox 30d, orphan 24h, link preview 30d.",
      values: {
        "modules.posts.outbox_retention_days": "30",
        "modules.posts.orphan_media_grace_hours": "24",
        "modules.posts.deleted_grace_days": "7",
        "modules.posts.link_preview_cache_days": "30",
      },
    },
    {
      id: "growth",
      label: "Growth (1k-10k MAU)",
      description: "More aggressive outbox retention (15d) to limit storage. Reduced orphan grace.",
      values: {
        "modules.posts.outbox_retention_days": "15",
        "modules.posts.orphan_media_grace_hours": "12",
        "modules.posts.deleted_grace_days": "7",
        "modules.posts.link_preview_cache_days": "60",
      },
    },
    {
      id: "scale",
      label: "Scale (10k+ MAU)",
      description: "Aggressive cleanup. Outbox 7d, orphan 6h. Longer link preview cache to reduce external fetches.",
      values: {
        "modules.posts.outbox_retention_days": "7",
        "modules.posts.orphan_media_grace_hours": "6",
        "modules.posts.deleted_grace_days": "7",
        "modules.posts.link_preview_cache_days": "90",
      },
    },
  ],
};

const MEDIA_CAPACITY: CapacityProfile = {
  scope: "media",
  label: "Media & content limits",
  currentTier: "alpha",
  resources: [
    {
      name: "Cloudflare R2 (social-media bucket)",
      plan: "Free",
      limits: [
        "10GB storage",
        "1M Class A ops/month",
        "10M Class B ops/month",
      ],
      upgradeAt: "Storage > 8GB or ops > 80%",
      upgradePath:
        "R2 is pay-as-you-go (~$0.015/GB/month above the free tier) — auto-scale, no manual upgrade",
      docsUrl: "https://developers.cloudflare.com/r2/pricing/",
    },
    {
      name: "Vercel (image processing via sharp)",
      plan: "Hobby/Free",
      limits: ["100GB-hours/month of Serverless compute"],
      upgradeAt: "p95 image processing > 2s or compute budget > 70%",
      upgradePath:
        "Vercel Pro ($20/mo) OR swap to Cloudflare Worker + R2 Queue (see roadmap)",
      docsUrl: "https://vercel.com/pricing",
    },
  ],
  tunables: [
    { key: "modules.posts.max_body_length",      label: "Max post body length (chars)" },
    { key: "modules.posts.max_images_per_post",  label: "Max images per post" },
    { key: "modules.posts.edit_window_minutes",  label: "Post edit window (min)" },
  ],
  presets: [
    {
      id: "alpha",
      label: "Alpha (<100 MAU)",
      description: "Beta testers: 15min edit window (margin to fix), max 4 images, 2000 char body.",
      values: {
        "modules.posts.max_body_length": "2000",
        "modules.posts.max_images_per_post": "4",
        "modules.posts.edit_window_minutes": "15",
      },
    },
    {
      id: "beta",
      label: "Beta (100-1k MAU)",
      description: "Standard 10min edit window (Twitter-like). Body and images unchanged.",
      values: {
        "modules.posts.max_body_length": "2000",
        "modules.posts.max_images_per_post": "4",
        "modules.posts.edit_window_minutes": "10",
      },
    },
    {
      id: "growth",
      label: "Growth (1k-10k MAU)",
      description: "Body reduced to 1500 chars to discourage wall-of-text. 10min edit window.",
      values: {
        "modules.posts.max_body_length": "1500",
        "modules.posts.max_images_per_post": "4",
        "modules.posts.edit_window_minutes": "10",
      },
    },
    {
      id: "scale",
      label: "Scale (10k+ MAU)",
      description: "1000 char body + max 3 images to reduce R2 ops. 5min edit window for thread stability.",
      values: {
        "modules.posts.max_body_length": "1000",
        "modules.posts.max_images_per_post": "3",
        "modules.posts.edit_window_minutes": "5",
      },
    },
  ],
};

const POSTS_CAPACITY_PROFILES: CapacityProfile[] = [
  COMMENTS_CAPACITY,
  RATE_LIMITS_CAPACITY,
  RETENTION_CAPACITY,
  MEDIA_CAPACITY,
];

export const POSTS_MODULE: ModuleManifest = {
  slug: "posts",
  label: "Posts",
  description: "Social feed: composer, reactions, comments, reposts, bookmarks, moderation.",
  version: "1.0.0", // 1.0.0 = feature-complete 2026-05-18: PR-9 SEO sitemap+meta + post-in-modale intercepting + quote repost UI + sticky default visibility + visibility-gating embed. 0.3.0 = reactions refactor (M_posts_008). 0.2.0 = thread commenti 2-livelli.
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
      key: "posts-reports",
      href: "/modules/posts/reports",
      label: "Reports",
      icon: "Flag",
      // Permission separata (NON auto-granted ad admin). Solo i moderatori
      // designati vedono la queue di review.
      permission: "modules:posts.moderate",
    },
    {
      key: "posts-deleted",
      href: "/modules/posts/deleted",
      label: "Deleted",
      icon: "Trash2",
      // Solo moderatori vedono i post soft-deleted in grace e possono
      // ripristinarli prima che il cron li hard-cancelli.
      permission: "modules:posts.moderate",
    },
    {
      key: "posts-comments",
      href: "/modules/posts/comments",
      label: "Comments",
      icon: "MessageSquare",
      permission: "modules:posts",
    },
    {
      key: "posts-cron",
      href: "/modules/posts/cron",
      label: "Cron",
      icon: "Clock",
      permission: "modules:posts",
    },
    {
      key: "posts-settings",
      href: "/modules/posts/settings",
      label: "Settings",
      icon: "Settings",
      permission: "modules:posts",
    },
    {
      key: "posts-architecture",
      href: "/modules/posts/architecture",
      label: "Architettura",
      icon: "BookOpen",
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
    {
      jobname: "modules-posts-hard-delete-deleted",
      path: "/api/cron/modules/posts/hard-delete-deleted",
      schedule: "0 5 * * *",
      label: "Posts Hard-Delete (post grace)",
      description:
        "Hard-deletes posts soft-deleted by their author whose deleted_at is older than modules.posts.deleted_grace_days (default 7d). CASCADE on FK cleans up reactions/comments/bookmarks/reports/tickers/mentions/outbox; orphan R2 media files are reclaimed by the orphan-media-cleanup job.",
      purpose:
        "Twitter-style grace window: gives moderators 7 days to restore an erroneously deleted post before it disappears for good. Keeps the posts table bounded.",
    },
  ],
  capacityProfiles: POSTS_CAPACITY_PROFILES,
};
