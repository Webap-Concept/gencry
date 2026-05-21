// lib/admin/capacity/core-profiles.ts
//
// Profili capacity per i servizi esterni usati dal CORE (non da moduli
// installabili). Aggregati dal widget dashboard `capacity-overview`
// insieme ai `manifest.capacityProfiles` dei moduli installati.
//
// Convenzione:
//   - scope namespace `core-*` per distinguerli dai profili modulo.
//   - currentTier rispecchia il piano REALE del provider in produzione.
//     Quando si upgrada un piano (es. Supabase Free → Pro), AGGIORNARE
//     QUI il tier + i `resources[].plan` + `limits[]`.
//   - tunables/presets omessi: i parametri core sono settings globali
//     di sistema, non "preset di feature". Il widget gestisce graceful.
//
// Drift è inevitabile (l'admin upgrada il piano e dimentica di
// aggiornare qui). Mitigation tier 2: pull live usage dalle API di
// ciascun provider (Upstash, Supabase, Vercel) e validare il tier
// dichiarato. Per ora il file è la documentazione manuale dello stato.
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
          "500 MB storage",
          "2 GB egress/mese",
          "Pool max 60 connessioni",
          "Auto-pausa dopo 7 giorni inattività",
        ],
        upgradeAt: "Pro ($25/mo) quando storage > 400 MB OR egress > 1.5 GB/mese",
        upgradePath:
          "Upgrade Supabase a Pro (8 GB storage, 250 GB egress, no auto-pause).",
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
          "10.000 comandi/giorno",
          "256 MB storage",
          "1 GB bandwidth/mese",
        ],
        upgradeAt: "Pay-as-you-go quando comandi/giorno > 8k regolarmente",
        upgradePath:
          "Switch a Pay-as-you-go ($0.20 per 100k comandi) — niente cap, scale lineare.",
        docsUrl: "https://upstash.com/pricing",
        monthlyCost: 0,
        // Probe live richiede `upstash_management_api_key` +
        // `upstash_management_database_id` in app_settings. Senza →
        // graceful fail con error="missing_token", card resta visibile.
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
          "200 connessioni concorrenti",
          "2 M messaggi/mese",
        ],
        upgradeAt: "Pro quando > 150 concurrent connections regolari",
        upgradePath:
          "Upgrade Supabase Pro (500 conn) oppure swap a Ably/Pusher via service hookable.",
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
          "1 GB storage totale",
          "2 GB egress/mese",
        ],
        upgradeAt: "Pro a 800 MB storage o 1.5 GB egress/mese",
        upgradePath:
          "Upgrade Supabase Pro (100 GB storage, 250 GB egress).",
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
          "10 GB storage/mese",
          "1 M Class A operations (write/list)",
          "10 M Class B operations (read)",
          "Egress GRATIS",
        ],
        upgradeAt: "Pay-as-you-go a 8 GB storage o 800k Class A ops/mese",
        upgradePath:
          "Pay-as-you-go: $0.015/GB storage, $4.50 per 1M Class A, $0.36 per 1M Class B. Egress sempre gratis.",
        docsUrl: "https://www.cloudflare.com/products/r2/",
        monthlyCost: 0,
      },
    ],
  },
  {
    scope: "core-email",
    label: "Email transazionali (Resend)",
    currentTier: "alpha",
    resources: [
      {
        name: "Resend",
        plan: "Free",
        limits: [
          "3.000 emails/mese",
          "100 emails/giorno",
          "1 dominio verificato",
        ],
        upgradeAt: "Pro ($20/mo) a 2.500 emails/mese regolari o > 80/giorno",
        upgradePath:
          "Upgrade Resend Pro (50k emails/mese, 10 domini) oppure swap a Postmark/SendGrid via service hookable.",
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
          "100 GB bandwidth/mese",
          "100k function invocations/giorno",
          "6.000 build minutes/mese",
          "Solo uso non-commerciale",
        ],
        upgradeAt: "Pro ($20/mo) quando bandwidth > 80 GB/mese OR si va commercial",
        upgradePath:
          "Upgrade Vercel Pro (1 TB bandwidth, 1M invocations/giorno, uso commerciale ammesso).",
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
          "5.000 errors/mese",
          "10k performance units/mese",
          "1 GB attachments",
          "1 user",
        ],
        upgradeAt:
          "Team ($26/mo) a 4.000 errors/mese regolari OR > 1 dev",
        upgradePath:
          "Upgrade Sentry Team (50k errors, 100k perf, 5 users) — paghi per platform unit ad uso.",
        docsUrl: "https://sentry.io/pricing/",
        monthlyCost: 0,
        // Probe live legge errors accepted mese da Sentry stats v2 API.
        // Riusa SENTRY_API_AUTH_TOKEN già in env (vedi lib/sentry/issues.ts).
        loadUsage: () => import("./probes/sentry"),
      },
    ],
  },
];
