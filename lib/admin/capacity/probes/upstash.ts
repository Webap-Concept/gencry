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
// Quota Free = 10k commands/giorno → il numero ritornato è "today's
// commands consumed", `period: "daily"`.
//
// Safe-to-fail in tutti i rami: token mancante, http error, payload
// imprevisto → `{ error: <code> }`. Mai throw.
import "server-only";

import { getAppSettings } from "@/lib/db/settings-queries";
import type { CapacityUsageProbe } from "@/lib/modules/types";

const UPSTASH_FREE_COMMANDS_PER_DAY = 10_000;

interface UpstashDatabaseResponse {
  daily_requests?: Array<{ date?: string; requests?: number }>;
}

export default async function probeUpstashUsage(): Promise<
  CapacityUsageProbe | { error: string }
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
      `https://api.upstash.com/v2/redis/database/${encodeURIComponent(databaseId)}`,
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
    const json = (await res.json()) as UpstashDatabaseResponse;

    // daily_requests è ordinato cronologicamente; prendiamo l'ultimo
    // datapoint che, su Upstash, rappresenta il count del giorno corrente.
    const today = json.daily_requests?.[json.daily_requests.length - 1];
    const current = Number(today?.requests ?? 0);
    const max = UPSTASH_FREE_COMMANDS_PER_DAY;
    return {
      current,
      max,
      unit: "commands/day",
      percent: Math.min(1, current / max),
      period: "daily",
      measuredAt: new Date(),
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "network",
    };
  }
}
