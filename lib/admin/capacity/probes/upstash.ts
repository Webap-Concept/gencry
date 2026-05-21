// lib/admin/capacity/probes/upstash.ts
//
// Probe live di usage per Upstash Redis. Legge i daily commands del
// database via Upstash Management API (`/v2/redis/database/{id}`).
//
// Setup richiesto (NON automatico):
//   - Generare un Management API key sul dashboard Upstash:
//     Account → Management API → Create API key (Read-Only consigliato)
//   - Salvarla in `app_settings` come:
//       - `upstash_management_email`       (email account Upstash)
//       - `upstash_management_api_key`     (api key)
//       - `upstash_management_database_id` (uuid del database)
//   Auth = Basic email:api_key (formato Upstash standard, NON Bearer).
//   Senza queste 3 settings → la probe ritorna { error: "missing_token" }
//   e la card capacity mostra solo i dati dichiarati. Nessun crash.
//
// Quota Free corrente (2026) = 500k commands/mese → la probe somma i
// daily_requests del mese in corso, `period: "monthly"`. Allineato al
// counter "X / 500k per month" del dashboard Upstash.
//
// Safe-to-fail in tutti i rami: token mancante, http error, payload
// imprevisto → `{ error: <code> }`. Mai throw.
import "server-only";

import { getAppSettings } from "@/lib/db/settings-queries";
import type { CapacityUsageProbe } from "@/lib/modules/types";

const UPSTASH_FREE_COMMANDS_PER_MONTH = 500_000;

// Shape Get Database Stats (/v2/redis/stats/:id). Documentato qui:
// https://upstash.com/docs/devops/developer-api/redis/get_database_stats
// Campi rilevanti per la probe usage:
//   - `total_monthly_requests` (number) — counter totale del mese in
//      corso. È esattamente quello mostrato sul dashboard
//      ("X / 500k per month"). Lo usiamo direttamente.
//   - `dailyrequests` (note: no underscore) — array di datapoints
//      `{ x: <timestamp_ms>, y: <count> }`. Fallback se monthly assente.
// Altri campi disponibili (non usati qui): throughput, diskusage,
// keyspace, latencies, ecc.
interface UpstashStatsResponse {
  total_monthly_requests?: number;
  total_monthly_read_requests?: number;
  total_monthly_write_requests?: number;
  dailyrequests?: Array<{ x?: number; y?: number }>;
}

export default async function probeUpstashUsage(): Promise<
  CapacityUsageProbe[] | { error: string }
> {
  const settings = await getAppSettings();
  const email = (settings as Record<string, string | null>)[
    "upstash_management_email"
  ]?.trim();
  const apiKey = (settings as Record<string, string | null>)[
    "upstash_management_api_key"
  ]?.trim();
  const databaseId = (settings as Record<string, string | null>)[
    "upstash_management_database_id"
  ]?.trim();

  if (!email || !apiKey || !databaseId) {
    // Diagnostic temporaneo: dump delle chiavi upstash_* viste dal layer
    // settings (snapshot R2 o DB). Utile per discriminare:
    //   - "(none)" → snapshot/DB completamente vuoto (sync fallito).
    //   - "upstash_redis_rest_url=len:..., upstash_redis_rest_token=len:..." senza
    //      management_* → il sync R2 NON ha incluso le nuove key (stale).
    //   - tutte presenti con `len:N` plausibile → il problema è altrove.
    // Rimuovere questo log a setup confermato.
    const upstashKeys = Object.keys(settings as Record<string, unknown>)
      .filter((k) => k.startsWith("upstash"))
      .map((k) => {
        const v = (settings as Record<string, string | null>)[k];
        return `${k}=${v ? `len:${v.length}` : "null/missing"}`;
      })
      .join(", ");
    console.warn(
      "[probe/upstash] missing_token. Snapshot keys upstash_* =",
      upstashKeys || "(none)",
    );
    return { error: "missing_token" };
  }

  // Upstash management auth = Basic con email:apiKey (formato standard
  // documentato in upstash.com/docs/devops/developer-api). NON Bearer:
  // Bearer dà 401 unauthorized, è quello che ci ha bruciato la prima volta.
  const basicAuth =
    "Basic " + Buffer.from(`${email}:${apiKey}`).toString("base64");
  try {
    const res = await fetch(
      `https://api.upstash.com/v2/redis/stats/${encodeURIComponent(databaseId)}`,
      {
        headers: {
          Authorization: basicAuth,
          Accept: "application/json",
        },
        next: { revalidate: 300 },
      },
    );
    if (res.status === 401 || res.status === 403) {
      return { error: "unauthorized" };
    }
    if (!res.ok) {
      return { error: `http_${res.status}` };
    }
    const json = (await res.json()) as UpstashStatsResponse;
    const measuredAt = new Date();

    // Metrica 1 — Mensile (counter aggregato dashboard "X / 500k per month").
    // Fallback a somma dei dailyrequests del mese se il campo è assente.
    let monthly = 0;
    if (typeof json.total_monthly_requests === "number") {
      monthly = json.total_monthly_requests;
    } else if (json.dailyrequests) {
      const monthStartMs = Date.UTC(
        measuredAt.getUTCFullYear(),
        measuredAt.getUTCMonth(),
        1,
      );
      monthly = json.dailyrequests
        .filter((d) => typeof d.x === "number" && d.x >= monthStartMs)
        .reduce((sum, d) => sum + Number(d.y ?? 0), 0);
    }
    const monthlyMax = UPSTASH_FREE_COMMANDS_PER_MONTH;

    // Metrica 2 — Giornaliera (ultimo datapoint disponibile, di solito oggi).
    // Upstash Free 2026 non ha quota giornaliera → `max: null` → renderer
    // mostra solo il numero senza barra. Utile come segnale di trend.
    const lastDp = json.dailyrequests?.[json.dailyrequests.length - 1];
    const daily = Number(lastDp?.y ?? 0);

    return [
      {
        current: monthly,
        max: monthlyMax,
        unit: "commands",
        percent: Math.min(1, monthly / monthlyMax),
        period: "monthly",
        measuredAt,
      },
      {
        current: daily,
        max: null,
        unit: "commands",
        percent: 0,
        period: "daily",
        measuredAt,
      },
    ];
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "network",
    };
  }
}
