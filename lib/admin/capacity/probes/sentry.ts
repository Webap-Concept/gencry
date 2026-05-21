// lib/admin/capacity/probes/sentry.ts
//
// Probe live di usage per Sentry. Legge il count di error events accepted
// nell'ultimo periodo (default 30 giorni → "monthly") via Sentry stats v2
// API. Riusa la stessa env config del widget Sentry dashboard
// (`loadSentryWidgetConfig` da lib/sentry/issues.ts).
//
// Limite teorico: Sentry Developer Free = 5k errors/mese, 10k performance
// units, 1 GB attachments. Esponiamo solo `errors/mese` (è la dimensione
// più rilevante per il dashboard capacity); le altre metric si possono
// aggiungere come probe addizionali se servirà.
//
// Safe-to-fail: env mancante / API non raggiungibile / payload imprevisto
// → ritorna `{ error }` invece di throw. Il widget capacity rende la card
// senza il chip usage; le altre informazioni dichiarate restano visibili.
import "server-only";

import { loadSentryWidgetConfig } from "@/lib/sentry/issues";
import type { CapacityUsageProbe } from "@/lib/modules/types";

/** Sentry Developer Free quota mensile di errors accepted. */
const SENTRY_FREE_ERRORS_PER_MONTH = 5_000;

interface StatsResponse {
  groups?: Array<{
    by?: { outcome?: string };
    totals?: { "sum(quantity)"?: number };
  }>;
}

export default async function probeSentryUsage(): Promise<
  CapacityUsageProbe | { error: string }
> {
  const config = loadSentryWidgetConfig();
  if (!config) {
    return { error: "missing_env" };
  }
  const { org, token } = config;

  // stats_v2 API: aggrega per `outcome` (accepted/filtered/rate_limited).
  // Ci interessa `accepted`: gli error che hanno consumato quota.
  // Filed `sum(quantity)` ritorna il count cumulato nel range.
  const url = new URL(
    `https://sentry.io/api/0/organizations/${encodeURIComponent(org)}/stats_v2/`,
  );
  url.searchParams.set("statsPeriod", "30d");
  url.searchParams.set("interval", "1d");
  url.searchParams.set("groupBy", "outcome");
  url.searchParams.set("field", "sum(quantity)");
  url.searchParams.set("category", "error");

  try {
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
      // Cache lato Next: 5 minuti, sufficiente per la dashboard.
      next: { revalidate: 300 },
    });
    if (res.status === 401 || res.status === 403) {
      return { error: "unauthorized" };
    }
    if (!res.ok) {
      return { error: `http_${res.status}` };
    }
    const json = (await res.json()) as StatsResponse;
    const acceptedGroup = json.groups?.find(
      (g) => g.by?.outcome === "accepted",
    );
    const current = Number(acceptedGroup?.totals?.["sum(quantity)"] ?? 0);
    const max = SENTRY_FREE_ERRORS_PER_MONTH;
    return {
      current,
      max,
      unit: "errors",
      percent: Math.min(1, current / max),
      period: "monthly",
      measuredAt: new Date(),
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "network",
    };
  }
}
