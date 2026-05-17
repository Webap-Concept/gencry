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

// Capacity profiles del modulo Posts. 1 profilo per "feature autonoma"
// (vedi memoria feedback_capacity_profile_pattern). La UI admin di
// ogni tab legge il profilo via lookup `scope`.
//
// Scopes definiti:
//   - "comments" → live mode + reply prefetch + cache TTL
//   - "rate-limits" → Upstash sliding window per post/reaction/etc (placeholder, attesa Upstash + form admin dedicato)
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
        "200 conn concorrenti",
        "2M msg/mese",
        "100 msg/sec per conn",
      ],
      upgradeAt: "500 viewer simultanei o concurrent conn > 70% del limite",
      upgradePath:
        "Supabase Pro (500 conn) OR swap a Ably/Pusher via service hookable comments-realtime.ts",
      docsUrl: "https://supabase.com/docs/guides/realtime",
    },
    {
      name: "Supabase Postgres (posts_comments)",
      plan: "Free",
      limits: [
        "500MB DB share",
        "200 conn concorrenti via pool",
      ],
      upgradeAt: "p95 query > 100ms (M_posts_007 indici parziali coprono il fan-out)",
      upgradePath:
        "Upgrade Supabase Pro ($25/mo) — sblocca 8GB DB e 500 conn",
      docsUrl: "https://supabase.com/pricing",
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
      description: "Realtime aggressivo, niente cache aggressive — feedback immediato per chiusura early-stage.",
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
      description: "Subscribe sulla page, poll nel feed per non saturare conn realtime. Cache un po' più aggressiva.",
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
      description: "Realtime solo su page dedicata, poll ovunque, cache lunga. Conviene anche attivare Upstash KV + Supabase Pro.",
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
      description: "Realtime off di default — banner via poll lungo. Cache aggressiva. Necessita single-channel pooling (V2 future) + Upstash + Supabase Pro + monitoring proattivo.",
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

// Placeholder profiles — capacity dichiarata oggi anche se i form admin
// dedicati non esistono ancora (vivono dentro il tab Settings generale
// o sotto la pagina del modulo). Quando aggiungeremo form admin
// dedicati, useranno questi profili via lookup scope.

const RATE_LIMITS_CAPACITY: CapacityProfile = {
  scope: "rate-limits",
  label: "Rate limiting (anti-spam)",
  currentTier: "alpha",
  resources: [
    {
      name: "Upstash KV (sliding window)",
      plan: "Non attivato",
      limits: ["10k req/giorno gratis quando attivato"],
      upgradeAt: "Apertura registrazione pubblica → rischio spam reale",
      upgradePath:
        "Pay-as-you-go Upstash ~$10/mo a 1k MAU — service rate-limit.ts oggi pass-through, swap a impl Upstash senza toccare i caller",
      docsUrl: "https://upstash.com/pricing",
    },
  ],
  tunables: [
    { key: "modules.posts.rate_limit_post_per_hour",     label: "Post per ora" },
    { key: "modules.posts.rate_limit_reaction_per_min",  label: "Reaction per min" },
    { key: "modules.posts.rate_limit_comment_per_min",   label: "Comment per min" },
    { key: "modules.posts.rate_limit_repost_per_hour",   label: "Repost per ora" },
    { key: "modules.posts.rate_limit_report_per_hour",   label: "Report per ora" },
    { key: "modules.posts.rate_limit_media_per_hour",    label: "Media upload per ora" },
  ],
  presets: [
    {
      id: "alpha",
      label: "Alpha (<100 MAU)",
      description: "Limits permissivi — early users hanno comportamento legittimo, no spam.",
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
      description: "Limits leggermente più stretti su post/repost per evitare flood casuale.",
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
      description: "Limits realistici per traffico pubblico: post 5/h è plenty per un utente vero, scoraggia bot.",
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
      description: "Limits stretti + monitoring abuse. Considerare captcha sui write action di nuovi account.",
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
      upgradeAt: "outbox > 100k righe non processate o storage > 80%",
      upgradePath:
        "Aumentare cleanup cadenza + ridurre retention days. In ultima istanza Supabase Pro.",
      docsUrl: "https://supabase.com/pricing",
    },
    {
      name: "Cloudflare R2 (orphan media)",
      plan: "Free",
      limits: ["10GB storage"],
      upgradeAt: "Storage > 8GB",
      upgradePath:
        "Cron orphan-media-cleanup giornaliero + restringere grace hours.",
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
      description: "Retention generosa per debug. Volume basso, costo trascurabile.",
      values: {
        "modules.posts.outbox_retention_days": "30",
        "modules.posts.orphan_media_grace_hours": "24",
        "modules.posts.deleted_grace_days": "7",
        "modules.posts.link_preview_cache_days": "30",
      },
    },
    {
      id: "beta",
      label: "Beta (100-1k MAU)",
      description: "Stessi valori — il fan-out non giustifica restrizioni.",
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
      description: "Outbox retention più aggressiva (15gg) per limitare storage. Orphan grace ridotto.",
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
      description: "Cleanup aggressivo. Outbox 7gg, orphan 6h. Link preview cache più lunga per ridurre fetch esterni.",
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
        "1M ops Classe A/mese",
        "10M ops Classe B/mese",
      ],
      upgradeAt: "Storage > 8GB o ops > 80%",
      upgradePath:
        "R2 è pay-as-you-go (~$0.015/GB/mese sopra free tier) — auto-scale, no upgrade manuale",
      docsUrl: "https://developers.cloudflare.com/r2/pricing/",
    },
    {
      name: "Vercel (image processing via sharp)",
      plan: "Hobby/Free",
      limits: ["100GB-hours/mese di Serverless compute"],
      upgradeAt: "p95 image processing > 2s o budget compute > 70%",
      upgradePath:
        "Vercel Pro ($20/mo) OR swap a Cloudflare Worker + R2 Queue (vedi roadmap)",
      docsUrl: "https://vercel.com/pricing",
    },
  ],
  tunables: [
    { key: "modules.posts.max_body_length",      label: "Max body length post (char)" },
    { key: "modules.posts.max_images_per_post",  label: "Max immagini per post" },
    { key: "modules.posts.edit_window_minutes",  label: "Edit window post (min)" },
  ],
  presets: [
    {
      id: "alpha",
      label: "Alpha (<100 MAU)",
      description: "Limits generosi — sperimentazione product, retention bassa di edit per non penalizzare beta tester.",
      values: {
        "modules.posts.max_body_length": "2000",
        "modules.posts.max_images_per_post": "4",
        "modules.posts.edit_window_minutes": "10",
      },
    },
    {
      id: "beta",
      label: "Beta (100-1k MAU)",
      description: "Stessi valori — early adopters non sono fonte di abuse.",
      values: {
        "modules.posts.max_body_length": "2000",
        "modules.posts.max_images_per_post": "4",
        "modules.posts.edit_window_minutes": "10",
      },
    },
    {
      id: "growth",
      label: "Growth (1k-10k MAU)",
      description: "Limits invariati — sotto soglia ops/storage R2.",
      values: {
        "modules.posts.max_body_length": "2000",
        "modules.posts.max_images_per_post": "4",
        "modules.posts.edit_window_minutes": "10",
      },
    },
    {
      id: "scale",
      label: "Scale (10k+ MAU)",
      description: "Edit window ridotta (5min) per stabilità thread + ridurre re-processing media. Max immagini invariato — è product, non infra.",
      values: {
        "modules.posts.max_body_length": "2000",
        "modules.posts.max_images_per_post": "4",
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
  version: "0.2.0", // 0.2.0 = aggiunta thread commenti 2-livelli (PR-comments). 1.0.0 quando PR-9 SEO sitemap chiude.
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
