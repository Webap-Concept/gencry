// lib/admin/capacity/core-profiles.ts
//
// Capacity profiles for the external services used by the CORE (not by
// installable modules). Aggregated by the dashboard widget
// `capacity-overview` together with the `manifest.capacityProfiles` of
// the installed modules.
//
// Convention:
//   - scope namespace `core-*` to distinguish them from module profiles.
//   - currentTier reflects the REAL plan of the provider in production.
//     When upgrading a plan (e.g. Supabase Free → Pro), UPDATE the tier
//     here together with `resources[].plan` and `limits[]`.
//   - tunables/presets omitted: core parameters are global system
//     settings, not "feature presets". The widget renders gracefully.
//
// Strings here are intentionally EN-only (no i18n lookup): these are
// admin/dev-facing technical notes, not user-facing UI copy.
//
// Drift is unavoidable (the admin upgrades the plan and forgets to
// update this file). Tier-2 mitigation: pull live usage from each
// provider's API (Upstash, Supabase, Vercel) and validate the declared
// tier. For now this file is the manual documentation of the state.
import "server-only";

import type { CapacityProfile } from "@/lib/modules/types";

export const CORE_CAPACITY_PROFILES: ReadonlyArray<CapacityProfile> = [
  {
    scope: "core-database",
    label: "Database (Postgres)",
    currentTier: "alpha",
    resources: [
      {
        name: "Supabase Postgres",
        plan: "Free",
        limits: [
          "500 MB DB storage",
          "5 GB egress/month",
          "60 direct connections / 200 pooler",
          "Auto-pause after 7 days of inactivity",
          "50,000 MAU included",
          "Max 2 active projects",
        ],
        upgradeAt:
          "Pro ($25/mo) when storage > 400 MB OR egress > 4 GB/month OR MAU > 40k",
        upgradePath:
          "Supabase Pro ($25/mo): 8 GB storage, 250 GB egress, 100k MAU, no auto-pause, $10/mo compute credits.",
        docsUrl: "https://supabase.com/pricing",
        monthlyCost: 0,
      },
    ],
  },
  {
    scope: "core-kv",
    label: "KV Cache (Upstash)",
    currentTier: "alpha",
    resources: [
      {
        name: "Upstash Redis",
        plan: "Free",
        limits: [
          "500,000 commands/month",
          "256 MB storage",
          "50 GB bandwidth/month",
        ],
        upgradeAt: "Pay-as-you-go when commands/month > 400k consistently",
        upgradePath:
          "Switch to Pay-as-you-go ($0.20 per 100k commands) — no cap, linear scaling.",
        docsUrl: "https://upstash.com/pricing",
        monthlyCost: 0,
        // Live probe requires `upstash_management_email` +
        // `upstash_management_api_key` + `upstash_management_database_id`
        // in app_settings. Without them → graceful fail with error="missing_token",
        // the card stays visible.
        loadUsage: () => import("./probes/upstash"),
      },
    ],
  },
  {
    scope: "core-realtime",
    label: "Realtime (Supabase)",
    currentTier: "alpha",
    resources: [
      {
        name: "Supabase Realtime",
        plan: "Free",
        limits: [
          "200 concurrent connections",
          "2 million messages/month",
        ],
        upgradeAt:
          "Pro ($25/mo) when > 150 concurrent connections consistently OR > 1.5M msg/month",
        upgradePath:
          "Supabase Pro: 500 connections, 5M messages/month. Or swap to Ably/Pusher via the hookable service.",
        docsUrl: "https://supabase.com/docs/guides/realtime",
        monthlyCost: 0,
      },
    ],
  },
  {
    scope: "core-storage",
    label: "Storage (Supabase)",
    currentTier: "alpha",
    resources: [
      {
        name: "Supabase Storage",
        plan: "Free",
        limits: [
          "1 GB total storage",
          "5 GB egress/month",
        ],
        upgradeAt: "Pro ($25/mo) at 800 MB storage OR 4 GB egress/month",
        upgradePath:
          "Supabase Pro: 100 GB storage, 250 GB egress.",
        docsUrl: "https://supabase.com/docs/guides/storage",
        monthlyCost: 0,
      },
    ],
  },
  {
    scope: "core-r2",
    label: "Object Storage (R2)",
    currentTier: "alpha",
    resources: [
      {
        name: "Cloudflare R2",
        plan: "Free",
        limits: [
          "10 GB storage/month",
          "1 M Class A operations (write/list)",
          "10 M Class B operations (read)",
          "Egress FREE",
        ],
        upgradeAt: "Pay-as-you-go at 8 GB storage or 800k Class A ops/month",
        upgradePath:
          "Pay-as-you-go: $0.015/GB storage, $4.50 per 1M Class A, $0.36 per 1M Class B. Egress always free.",
        docsUrl: "https://www.cloudflare.com/products/r2/",
        monthlyCost: 0,
      },
    ],
  },
  {
    scope: "core-email",
    label: "Transactional email (Resend)",
    currentTier: "alpha",
    resources: [
      {
        name: "Resend",
        plan: "Free",
        limits: [
          "3,000 emails/month",
          "100 emails/day",
          "1 verified domain",
          "1,000 audience contacts",
          "30 days log retention",
        ],
        upgradeAt:
          "Pro ($20/mo) at 2,500 emails/month consistently OR > 80 emails/day",
        upgradePath:
          "Resend Pro ($20/mo, 50k emails) or Scale ($35/mo, 100k emails) — multiple domains. Swap to Postmark/SendGrid via the hookable service.",
        docsUrl: "https://resend.com/pricing",
        monthlyCost: 0,
      },
    ],
  },
  {
    scope: "core-hosting",
    label: "Hosting (Vercel)",
    currentTier: "alpha",
    resources: [
      {
        name: "Vercel",
        plan: "Hobby",
        limits: [
          "100 GB Fast Data Transfer/month",
          "1M Function Invocations/month",
          "1M Edge Requests/month",
          "5,000 Image Transformations/month",
          "Non-commercial use only",
        ],
        upgradeAt:
          "Pro ($20/user/month) when bandwidth > 80 GB/month OR invocations > 800k/month OR going commercial",
        upgradePath:
          "Vercel Pro ($20/user + $20 usage credit): 1 TB bandwidth, 10M edge requests, function invocations at $0.60/1M overage, commercial use allowed.",
        docsUrl: "https://vercel.com/pricing",
        monthlyCost: 0,
      },
    ],
  },
  {
    scope: "core-monitoring",
    label: "Error monitoring (Sentry)",
    currentTier: "alpha",
    resources: [
      {
        name: "Sentry",
        plan: "Developer (Free)",
        limits: [
          "5,000 errors/month",
          "5 M tracing spans/month",
          "50 session replays/month",
          "1 GB attachments",
          "1 user",
          "30 days retention",
        ],
        upgradeAt:
          "Team ($26/mo billed yearly) at 4,000 errors/month consistently OR > 1 dev OR replays > 40/month",
        upgradePath:
          "Sentry Team ($26/mo): 50k errors, 5M spans, unlimited users, 90 days retention, custom dashboard + Seer AI (additional sub).",
        docsUrl: "https://sentry.io/pricing/",
        monthlyCost: 0,
        // Live probe reads errors accepted/month from Sentry stats v2 API.
        // Reuses SENTRY_API_AUTH_TOKEN already in env (see lib/sentry/issues.ts).
        loadUsage: () => import("./probes/sentry"),
      },
    ],
  },
];
