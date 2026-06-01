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

    const base = url.replace(/\/+$/, "");
    const headers = { Authorization: `Bearer ${token}` };
    const map = new Map<string, QStashSchedule>();

    // 1) Schedule "ufficiali" da /v2/schedules.
    try {
      const res = await fetch(`${base}/v2/schedules`, {
        method: "GET",
        headers,
        next: { revalidate: 30 }, // cache 30s — admin hot path
      });
      if (res.ok) {
        const data = (await res.json()) as Array<{
          scheduleId: string;
          cron: string;
          destination: string;
          isPaused?: boolean;
          createdAt?: number;
        }>;
        for (const s of data) {
          map.set(s.scheduleId, {
            scheduleId: s.scheduleId,
            cron: s.cron,
            destination: s.destination,
            isPaused: s.isPaused ?? false,
            createdAt: s.createdAt ?? 0,
          });
        }
      } else {
        console.warn("[qstash-client] GET /v2/schedules →", res.status);
      }
    } catch (err) {
      console.warn("[qstash-client] schedules fetch failed:", err);
    }

    // 2) Merge da /v2/events. QStash a volte NON elenca in /v2/schedules degli
    //    schedule che però esegue regolarmente (osservato 2026-06-01: lista
    //    vuota ma deliveries `gencry-*` ogni minuto). Senza questo merge la UI
    //    mostrerebbe "Not on QStash" per cron in realtà attivi. Per ogni
    //    scheduleId `gencry-*` visto negli eventi recenti e non già in mappa,
    //    sintetizziamo una entry "attiva" (cron preso da CRON_SCHEDULES per
    //    evitare un falso mismatch; createdAt = ultima consegna come proxy).
    try {
      const res = await fetch(`${base}/v2/events`, {
        method: "GET",
        headers,
        next: { revalidate: 30 },
      });
      if (res.ok) {
        const body = (await res.json()) as
          | Array<Record<string, unknown>>
          | { events?: Array<Record<string, unknown>> };
        const events = Array.isArray(body) ? body : (body.events ?? []);
        for (const e of events) {
          const id = e.scheduleId;
          if (typeof id !== "string" || !id.startsWith("gencry-") || map.has(id)) continue;
          const jobname = id.slice("gencry-".length);
          const def = CRON_SCHEDULES.find((s) => s.jobname === jobname);
          const ts = typeof e.time === "number" ? e.time : typeof e.createdAt === "number" ? e.createdAt : 0;
          map.set(id, {
            scheduleId: id,
            cron: def?.schedule ?? "",
            destination: typeof e.url === "string" ? e.url : (typeof e.destination === "string" ? e.destination : ""),
            isPaused: false,
            createdAt: ts,
          });
        }
      }
    } catch (err) {
      console.warn("[qstash-client] events merge failed:", err);
    }

    // 3) Floor sui cron LOW-FREQUENCY. /v2/events recente è dominato dai cron
    //    @1min, quindi i job daily/4h cadono fuori dalla finestra e non
    //    vengono visti — pur essendo su QStash (synced insieme agli altri).
    //    Se QStash è dimostrabilmente attivo (map non vuota = schedule listati
    //    o consegne viste), mostriamo come attivi anche i CRON_SCHEDULES non
    //    ancora in mappa, invece del falso "Not on QStash". `createdAt: 0`
    //    (= "—") li distingue da quelli con consegna recente.
    //    Trade-off: si perde la drift-detection per i low-freq, già persa
    //    perché /v2/schedules ritorna vuoto (quirk QStash 2026-06-01).
    if (map.size > 0) {
      for (const def of CRON_SCHEDULES) {
        const id = `gencry-${def.jobname}`;
        if (map.has(id)) continue;
        map.set(id, {
          scheduleId: id,
          cron: def.schedule,
          destination: "",
          isPaused: false,
          createdAt: 0,
        });
      }
    }

    return map;
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
