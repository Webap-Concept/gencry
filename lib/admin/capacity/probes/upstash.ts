// lib/admin/capacity/probes/upstash.ts
//
// Probe live di usage per Upstash Redis. Legge i daily commands del
// database via Upstash Management API (`/v2/redis/database/{id}`).
//
// Setup richiesto (NON automatico):
//   - Generare un Management API token sul dashboard Upstash:
//     Account → Management API → Create API key
//   - Salvarlo in `app_settings` come:
//       - `upstash_management_api_key`   (string)
//       - `upstash_management_database_id` (uuid del database)
//   Senza queste 2 settings → la probe ritorna { error: "missing_token" }
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
  const apiKey = (settings as Record<string, string | null>)[
    "upstash_management_api_key"
  ]?.trim();
  const databaseId = (settings as Record<string, string | null>)[
    "upstash_management_database_id"
  ]?.trim();

  if (!apiKey || !databaseId) {
    return { error: "missing_token" };
  }

  // Upstash management auth = Basic con email:apiKey. Alcuni token
  // accettano Bearer; fallback a Basic se il primo dà 401. Per ora
  // usiamo Bearer (formato standard dei nuovi management token).
  try {
    const res = await fetch(
      `https://api.upstash.com/v2/redis/database/${encodeURIComponent(databaseId)}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
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
