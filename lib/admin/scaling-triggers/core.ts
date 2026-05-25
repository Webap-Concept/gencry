import "server-only";
// lib/admin/scaling-triggers/core.ts
//
// Scaling triggers cross-cutting (non appartenenti a un modulo specifico).
// Vengono concatenati ai trigger del manifest moduli da
// `collectAllScalingTriggers()`. Mantenuti qui per:
//   - DB pool: shared dal cluster, nessun modulo è "owner".
//   - DAU: metrica utenti complessivi, base per altre stime (Redis BW,
//     concurrent Realtime, ecc.).
//
// Filosofia: il modulo X NON sa di "DAU globale" → questi trigger non
// vivono nel manifest di X. Il widget aggrega entrambi i registry.
import type { ScalingTrigger } from "@/lib/modules/types";

export const CORE_SCALING_TRIGGERS: ScalingTrigger[] = [
  {
    id: "core.dau-30d",
    label: "DAU 30d",
    description:
      "Utenti unici con almeno una request rilevante negli ultimi 30 giorni (proxy: sessions.last_seen_at). Driver principale di tutti gli altri usage trigger.",
    loadMeasure: () => import(/* webpackChunkName: "probe-dau" */ "./probes/dau-30d"),
    threshold: 3500,
    warnThreshold: 2500,
    direction: "higher-is-worse",
    displayUnit: "DAU",
    softMitigation:
      "Se ci avviciniamo al cap: pianificare upgrade Upstash (100→500 GB) o ottimizzazioni stack (edge cache CDN sui post pubblici, compressione payload cached).",
    action: {
      docsHref: "/admin/capacity",
      summary:
        "A ~3500 DAU il consumo Upstash si avvicina al cap Pro 100 GB/mese (vedi calcolo dettagliato in capacity). Sopra, valutare upgrade piano o L1 cache più aggressiva.",
    },
  },
  {
    id: "core.db-pool",
    label: "DB pool active",
    description:
      "Query in esecuzione *ora* (state='active' in pg_stat_activity) vs max=30 del pool drizzle. Misura il workload, non l'occupazione del pool: connessioni idle in pool warm sono normali e non contate. Il dettaglio total/pool è nel formatted per spot-check di eventuali idle leak.",
    loadMeasure: () => import("./probes/db-pool-utilization"),
    threshold: 20,
    warnThreshold: 10,
    direction: "higher-is-worse",
    displayUnit: "active",
    softMitigation:
      "Audit fan-out query per request (è la causa storica della saturazione, vedi project_rsc_prefetch_fanout_bug). Cache by default le query in /admin layout (vedi feedback_db_pool_caution). Solo dopo, considera bump max in lib/db/drizzle.ts.",
    action: {
      docsHref: "/admin/capacity",
      summary:
        "Active connections alto: c'è un workload picco o un fan-out RSC fuori controllo. Verifica /admin layout query count, poi valuta cache aggressiva o bump pool max.",
    },
  },
];
