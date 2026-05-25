// lib/modules/news/manifest.ts
// Manifest del modulo News (curated content pipeline).
//
// Scope PR-1: schema DB + manifest + permissions + admin scaffolding +
// sources CRUD + Claude rewriter + cron handlers + admin queue review +
// CMS bridge + /news listing.
//
// Pipeline runtime:
//   cron ingestion (15min) → news_items.status='pending_rewrite'
//   cron rewrite    (5min) → news_items.status='review' (LLM IT rewrite)
//   admin review/edit/schedule
//   cron publisher (15min) → news_items.status='published' + pages row
//
// Module capacity profiles. Single "pipeline" scope because all the
// quotas (max scheduled/day, cron batch size, items retention) move
// together with the tier chosen by the admin.
//
// Strings here are intentionally EN-only (no i18n lookup): these are
// admin/dev-facing technical notes, not user-facing UI copy.

import type { CapacityProfile, ModuleManifest } from "@/lib/modules/types";

const PIPELINE_CAPACITY: CapacityProfile = {
  scope: "pipeline",
  label: "News pipeline (ingestion → rewrite → publish)",
  currentTier: "alpha",
  resources: [
    {
      name: "Claude API (Anthropic) — rewriter",
      plan: "Pay-as-you-go",
      limits: [
        "Sonnet 4.6 ~$3/Mtok input, $15/Mtok output",
        "Prompt caching enabled on the system prompt (-90% on repeated input cost)",
        "Estimate ~$0.02/article (800 tok in, 1200 tok out)",
      ],
      upgradeAt: "AI monthly cost > $50 or p95 latency > 8s",
      upgradePath:
        "Down-shift to Haiku 4.5 for 'trusted' sources (preset whitelist) or increase cache hits via fixed prompt sections",
      docsUrl: "https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching",
    },
    {
      name: "Supabase Postgres (news_items)",
      plan: "Free",
      limits: ["500MB DB share", "Partial indexes on status='scheduled'|'pending_rewrite'"],
      upgradeAt: "news_items > 100k rows (~years at 50/day)",
      upgradePath: "Cron cleanup of rejected items >30 days + possibly Supabase Pro",
      docsUrl: "https://supabase.com/pricing",
    },
    {
      name: "Cloudflare R2 (bucket storage, prefix news/)",
      plan: "Free (shared with the CMS media library)",
      limits: ["10GB free storage", "Egress $0"],
      upgradeAt: "Storage > 8GB",
      upgradePath: "R2 pay-as-you-go: ~$0.015/GB above the free tier",
      docsUrl: "https://developers.cloudflare.com/r2/pricing/",
    },
  ],
  tunables: [
    { key: "modules.news.rewrite_batch_size",       label: "Rewrite cron batch (items/run)" },
    { key: "modules.news.publisher_batch_size",     label: "Publisher cron batch (items/run)" },
    { key: "modules.news.max_published_per_day",    label: "Max articles published/day" },
    { key: "modules.news.rewrite_max_attempts",     label: "Max LLM attempts before fail" },
    { key: "modules.news.ai_model",                 label: "Claude model (Sonnet/Haiku)" },
    { key: "modules.news.fetch_max_items_per_source", label: "Max items ingested per fetch (per source)" },
    { key: "modules.news.proposed_retention_days", label: "Proposals auto-rejected after N days" },
  ],
  presets: [
    {
      id: "alpha",
      label: "Alpha (1-2 articles/day)",
      description: "Conservative setup: slow pipeline, minimal cost, tight manual oversight.",
      values: {
        "modules.news.rewrite_batch_size": "3",
        "modules.news.publisher_batch_size": "5",
        "modules.news.max_published_per_day": "2",
        "modules.news.rewrite_max_attempts": "3",
        "modules.news.ai_model": "claude-sonnet-4-6",
        "modules.news.fetch_max_items_per_source": "10",
        "modules.news.proposed_retention_days": "7",
      },
    },
    {
      id: "beta",
      label: "Beta (3-5 articles/day)",
      description: "Faster pipeline but still HIL. Higher rewrite batch to drain the queue.",
      values: {
        "modules.news.rewrite_batch_size": "5",
        "modules.news.publisher_batch_size": "10",
        "modules.news.max_published_per_day": "5",
        "modules.news.rewrite_max_attempts": "3",
        "modules.news.ai_model": "claude-sonnet-4-6",
        "modules.news.fetch_max_items_per_source": "15",
        "modules.news.proposed_retention_days": "7",
      },
    },
    {
      id: "growth",
      label: "Growth (10+ articles/day)",
      description: "Sonnet everywhere, large batches. Consider alerts on monthly AI cost.",
      values: {
        "modules.news.rewrite_batch_size": "10",
        "modules.news.publisher_batch_size": "20",
        "modules.news.max_published_per_day": "15",
        "modules.news.rewrite_max_attempts": "2",
        "modules.news.ai_model": "claude-sonnet-4-6",
        "modules.news.fetch_max_items_per_source": "25",
        "modules.news.proposed_retention_days": "5",
      },
    },
    {
      id: "scale",
      label: "Scale (high volume, cost under control)",
      description: "Switch to Haiku to cut costs 5x. Lower quality but high volume — admin review compensates.",
      values: {
        "modules.news.rewrite_batch_size": "20",
        "modules.news.publisher_batch_size": "30",
        "modules.news.max_published_per_day": "30",
        "modules.news.rewrite_max_attempts": "2",
        "modules.news.ai_model": "claude-haiku-4-5-20251001",
        "modules.news.fetch_max_items_per_source": "40",
        "modules.news.proposed_retention_days": "3",
      },
    },
  ],
};

export const NEWS_MODULE: ModuleManifest = {
  slug: "news",
  label: "News",
  description:
    "Curated news pipeline: scrape English RSS sources, rewrite in Italian with Claude, admin review with side-by-side editor + hero upload, schedule and publish as CMS pages (template=news).",
  version: "0.1.0",
  icon: "Newspaper",
  permission: "modules:news",
  permissionLabel: "Access News module",
  extraPermissions: [
    {
      key: "modules:news.moderate",
      label: "Moderate news queue",
      description:
        "Review/edit/publish/reject items in the news queue. NOT auto-granted to admin — assign explicitly.",
    },
  ],
  navChildren: [
    {
      key: "news-overview",
      href: "/modules/news",
      label: "Overview",
      icon: "Activity",
      permission: "modules:news",
      exact: true,
    },
    {
      key: "news-queue",
      href: "/modules/news/queue",
      label: "Queue",
      icon: "Inbox",
      permission: "modules:news.moderate",
    },
    {
      key: "news-sources",
      href: "/modules/news/sources",
      label: "Sources",
      icon: "Rss",
      permission: "modules:news",
    },
    {
      key: "news-cron",
      href: "/modules/news/cron",
      label: "Cron",
      icon: "Clock",
      permission: "modules:news",
    },
    {
      key: "news-settings",
      href: "/modules/news/settings",
      label: "Settings",
      icon: "Settings",
      permission: "modules:news",
    },
    {
      key: "news-architecture",
      href: "/modules/news/architecture",
      label: "Architettura",
      icon: "BookOpen",
      permission: "modules:news",
    },
  ],
  cronJobs: [
    {
      jobname: "modules-news-ingestion",
      path: "/api/cron/modules/news/ingestion",
      schedule: "*/15 * * * *",
      label: "News Ingestion",
      description:
        "Fetches RSS/Atom feeds from active news_sources, deduplicates via original_hash, inserts new items as pending_rewrite. Uses ETag/If-Modified-Since for cheap polling.",
      purpose:
        "Keeps the rewrite queue fed without manual scraping. 15-minute cadence balances freshness vs cron quota.",
    },
    {
      jobname: "modules-news-rewrite",
      path: "/api/cron/modules/news/rewrite",
      schedule: "*/5 * * * *",
      label: "News Rewrite (Claude)",
      description:
        "Picks N pending_rewrite items (FOR UPDATE SKIP LOCKED), calls Claude Sonnet 4.6 with prompt caching to rewrite the article in Italian. Marks items as review on success, failed on permanent errors after max attempts.",
      purpose:
        "Decouples ingestion from LLM latency. Batch size + model tunable via capacity profile.",
    },
    {
      jobname: "modules-news-publisher",
      path: "/api/cron/modules/news/publisher",
      schedule: "*/15 * * * *",
      label: "News Publisher (scheduled → CMS)",
      description:
        "Picks scheduled items with scheduled_publish_at <= NOW(), creates a pages row (templateId=news template) wired via customFields (hero_image, excerpt). Marks status=published.",
      purpose:
        "Honors the admin scheduling decisions. Decoupled from review action so the admin can schedule far in advance.",
    },
    {
      jobname: "modules-news-cleanup-proposed",
      path: "/api/cron/modules/news/cleanup-proposed",
      schedule: "0 3 * * *",
      label: "News Cleanup Proposed",
      description:
        "Auto-rejects items left in 'proposed' status longer than modules.news.proposed_retention_days. Sets status='rejected' with a flagged rejected_reason. Daily at 03:00.",
      purpose:
        "Keeps the propose queue bounded: if the admin doesn't act on a proposal within the retention window, it expires automatically.",
    },
  ],
  capacityProfiles: [PIPELINE_CAPACITY],
};
