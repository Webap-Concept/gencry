// lib/modules/posts/scaling-triggers-manifest.ts
//
// Scaling triggers del modulo Posts. File SEPARATO dal manifest principale
// per evitare che le `loadMeasure` (dynamic import di moduli server-only
// che dipendono da `lib/db/drizzle` e `lib/kv/sdk`) finiscano nel client
// bundle attraverso la catena admin-nav → sidebar → manifest.
//
// Pattern identico a `sitemap-manifest.ts`: il registry server-only
// `lib/modules/scaling-triggers-registry.ts` importa questi file
// direttamente. Il manifest principale del modulo NON sa di questi
// trigger.
import "server-only";

import type { ScalingTrigger } from "@/lib/modules/types";

const POSTS_SCALING_TRIGGERS: ScalingTrigger[] = [
  {
    id: "posts.post-cache-hit-rate",
    label: "Post-cache hit rate (7d)",
    description:
      "Hit rate L2 (Upstash) del post-cache V2 negli ultimi 7 giorni. Sotto il 50% significa che le invalidate sono troppo aggressive vs il TTL effettivo — è il segnale che V2.5 (write-through counter + transitive quote invalidation) potrebbe valere il costo.",
    loadMeasure: () => import("./probes/post-cache-hit-rate-loader"),
    threshold: 50,
    warnThreshold: 65,
    direction: "lower-is-worse",
    displayUnit: "%",
    softMitigation:
      "Verifica via UPSTASH_DEBUG=1 quale mutation invalida più spesso. Reaction toggle è il sospetto #1 — eventualmente skippare l'invalidate per i counter-only changes.",
    action: {
      docsHref: "/admin/modules/posts/architecture#future",
      summary:
        "Hit rate basso: valuta implementare V2.5 (vedi project_post_cache_v25_followup.md). Counter write-through evita invalidate-storm su reaction.",
    },
  },
  {
    id: "posts.realtime-channels",
    label: "Realtime concurrent channels (Supabase)",
    description:
      "Connessioni Realtime concorrenti sul project Supabase. Cap Pro = 500. Ogni viewer di una post-page apre 1 channel Broadcast (comments-realtime). Non c'è probe automatica — controllo manuale dal dashboard Supabase. Trigger a 70% del cap.",
    manualCheck: true,
    threshold: 350,
    warnThreshold: 250,
    direction: "higher-is-worse",
    displayUnit: "channels",
    softMitigation:
      "Passa modules.posts.comments.live_mode_post_page da 'subscribe' a 'poll' in /admin/modules/posts/settings → degrade soft a polling.",
    action: {
      docsHref: "https://supabase.com/dashboard/project/_/reports/api",
      summary:
        "Apri il dashboard Supabase → Reports → Realtime. Se concurrent connections > 350: passare a poll mode (escape hatch) e pianificare V2.5 (single-channel pooling o Edge Function fanout via posts_outbox).",
    },
  },
];

export default POSTS_SCALING_TRIGGERS;
