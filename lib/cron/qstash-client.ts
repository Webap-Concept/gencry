import "server-only";
// lib/cron/qstash-client.ts
//
// Lettura degli schedule QStash per le pagine admin cron. Usato solo
// lato server; le credenziali vengono da app_settings (stesse di
// /admin/services/qstash). Degraded-safe: se QStash non è configurato
// o non risponde, ritorna una mappa vuota senza throw.

import { cache } from "react";
import { getAppSettings } from "@/lib/db/settings-queries";
import { CRON_SCHEDULES } from "./cron-schedules";

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

// ─────────────────────────────────────────────────────────────────────
// Dead Letter Queue — fallimenti cron persistenti
//
// Quando una invocazione schedulata esaurisce i retry, QStash la sposta
// nella DLQ. Una entry DLQ = un cron che ha fallito in modo PERSISTENTE
// (non un blip transitorio). È la sorgente di verità per il generator di
// notifiche `cron-failures` dopo la migrazione da pg_cron.
// ─────────────────────────────────────────────────────────────────────

/** Quanto indietro consideriamo una entry DLQ come "fallimento attivo".
 *  Oltre questa finestra la entry invecchia → la notifica auto-resolve. */
export const DLQ_LOOKBACK_MS = 24 * 60 * 60 * 1000;

export interface QStashDlqFailure {
  /** ms epoch in cui il messaggio è finito in DLQ (ultimo tentativo). */
  createdAt: number;
  /** HTTP status dell'ultima risposta del target, se noto. */
  responseStatus: number | null;
  /** Corpo dell'ultima risposta (troncato lato consumer). */
  responseBody: string | null;
  /** URL di destinazione del cron. */
  url: string;
}

// path endpoint → jobname (sorgente di verità: CRON_SCHEDULES).
const PATH_TO_JOBNAME = new Map(CRON_SCHEDULES.map((s) => [s.path, s.jobname]));

/** Risolve il jobname da una entry DLQ: primario via path dell'URL di
 *  destinazione (robusto), fallback via scheduleId `gencry-<jobname>`. */
function jobnameFromDlq(msg: {
  url?: string;
  scheduleId?: string;
}): string | null {
  if (msg.url) {
    try {
      const path = new URL(msg.url).pathname;
      const j = PATH_TO_JOBNAME.get(path);
      if (j) return j;
    } catch {
      /* URL malformato → prova il fallback */
    }
  }
  if (msg.scheduleId?.startsWith("gencry-")) {
    return msg.scheduleId.slice("gencry-".length);
  }
  return null;
}

/**
 * Legge la DLQ di QStash e ritorna i fallimenti dei NOSTRI cron raggruppati
 * per jobname, più recente prima, limitati alla finestra `DLQ_LOOKBACK_MS`.
 *
 * React.cache: 1 fetch per render, condiviso da tutti i generator dello
 * stesso tick. NON degraded-safe come `getQStashSchedules`: se QStash non è
 * configurato o non risponde, fa THROW. È intenzionale — il dispatcher
 * notifiche cattura il throw per-generator e NON auto-resolve le notifiche
 * esistenti, evitando un falso "tutti i cron ok" quando in realtà non
 * abbiamo potuto verificare.
 *
 * Nota: leggiamo solo la prima pagina DLQ (default ~100). Se ci fossero
 * >100 fallimenti distinti in 24h il sistema è già gravemente rotto e
 * l'alert scatta comunque su ciò che leggiamo.
 */
export const getDlqFailuresByJobname = cache(
  async (): Promise<Map<string, QStashDlqFailure[]>> => {
    const settings = await getAppSettings();
    const url = settings.qstash_url?.trim();
    const token = settings.qstash_token?.trim();
    if (!url || !token) {
      throw new Error("[qstash-client] DLQ: qstash_url/token non configurati");
    }

    const res = await fetch(`${url.replace(/\/+$/, "")}/v2/dlq`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`[qstash-client] GET /v2/dlq → ${res.status}`);
    }

    const data = (await res.json()) as {
      messages?: Array<{
        url?: string;
        scheduleId?: string;
        createdAt?: number;
        responseStatus?: number;
        responseBody?: string;
      }>;
    };

    const cutoff = Date.now() - DLQ_LOOKBACK_MS;
    const byJob = new Map<string, QStashDlqFailure[]>();

    for (const msg of data.messages ?? []) {
      const createdAt = msg.createdAt ?? 0;
      if (createdAt < cutoff) continue; // troppo vecchio → ignora
      const jobname = jobnameFromDlq(msg);
      if (!jobname) continue; // non è uno dei nostri schedule
      const list = byJob.get(jobname) ?? [];
      list.push({
        createdAt,
        responseStatus: msg.responseStatus ?? null,
        responseBody: msg.responseBody ?? null,
        url: msg.url ?? "",
      });
      byJob.set(jobname, list);
    }

    // Ordina ogni gruppo per createdAt DESC (più recente prima).
    for (const list of byJob.values()) {
      list.sort((a, b) => b.createdAt - a.createdAt);
    }
    return byJob;
  },
);
