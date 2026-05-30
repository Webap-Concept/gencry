import "server-only";
// lib/cron/qstash-client.ts
//
// Lettura degli schedule QStash per le pagine admin cron. Usato solo
// lato server; le credenziali vengono da app_settings (stesse di
// /admin/services/qstash). Degraded-safe: se QStash non è configurato
// o non risponde, ritorna una mappa vuota senza throw.

import { cache } from "react";
import { getAppSettings } from "@/lib/db/settings-queries";

export interface QStashSchedule {
  scheduleId: string;
  cron: string;
  destination: string;
  isPaused: boolean;
  createdAt: number; // ms epoch
}

/**
 * Ritorna la mappa scheduleId → QStashSchedule di tutti gli schedule
 * presenti su QStash. React.cache: al massimo 1 fetch per page load.
 * Null = QStash non configurato; mappa vuota = fetch fallito.
 */
export const getQStashSchedules = cache(
  async (): Promise<Map<string, QStashSchedule> | null> => {
    const settings = await getAppSettings();
    const url = settings.qstash_url?.trim();
    const token = settings.qstash_token?.trim();
    if (!url || !token) return null;

    try {
      const res = await fetch(`${url.replace(/\/+$/, "")}/v2/schedules`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
        next: { revalidate: 30 }, // cache 30s — admin hot path
      });
      if (!res.ok) {
        console.warn("[qstash-client] GET /v2/schedules →", res.status);
        return new Map();
      }
      const data = (await res.json()) as Array<{
        scheduleId: string;
        cron: string;
        destination: string;
        isPaused?: boolean;
        createdAt?: number;
      }>;
      const map = new Map<string, QStashSchedule>();
      for (const s of data) {
        map.set(s.scheduleId, {
          scheduleId: s.scheduleId,
          cron: s.cron,
          destination: s.destination,
          isPaused: s.isPaused ?? false,
          createdAt: s.createdAt ?? 0,
        });
      }
      return map;
    } catch (err) {
      console.warn("[qstash-client] fetch failed:", err);
      return new Map();
    }
  },
);

/** Ritorna lo schedule QStash per un singolo jobname (ID = gencry-<jobname>). */
export async function getQStashScheduleForJob(
  jobname: string,
): Promise<QStashSchedule | null> {
  const map = await getQStashSchedules();
  if (!map) return null;
  return map.get(`gencry-${jobname}`) ?? null;
}
