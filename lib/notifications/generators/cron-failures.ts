/**
 * Generator: alert per cron job in errore.
 *
 * Pattern reconciliation: per ogni jobname nel filtro, leggiamo gli
 * ultimi N run da cron.job_run_details. Se l'ULTIMO run è failed
 * emettiamo un candidato; appena arriva un run riuscito,
 * l'auto-resolve del dispatcher chiude la notifica.
 *
 * Scoping: il framework supporta un solo `requiredPermission` per
 * generator. Per rispettare la separazione core/moduli, esponiamo
 * un factory `makeCronFailuresGenerator` e registriamo:
 *   - 1 generator "core" (admin:settings) → job core + untracked
 *   - 1 generator per modulo installato (modules:<slug>) → solo job
 *     posseduti dal modulo
 * Tutti i generator condividono lo stesso `type` (cron_job_failure)
 * così l'auto-resolve del dispatcher li tratta come un'unica
 * collezione.
 */
import { db } from "@/lib/db/drizzle";
import { sql } from "drizzle-orm";
import { buildAdminPath } from "@/lib/admin-paths";
import {
  CORE_CRON_JOBS,
  getAllRegisteredJobnames,
  getCronJobMeta,
  getModuleJobnames,
} from "@/lib/cron/registry";
import { INSTALLED_MODULES } from "@/lib/modules/registry";
import type {
  NotificationCandidate,
  NotificationGenerator,
  NotificationSeverity,
} from "../types";

export const CRON_FAILURE_TYPE = "cron_job_failure";

/** Soglia di fallimenti consecutivi sopra cui salire a critical. */
const CRITICAL_THRESHOLD = 5;

export type CronJobRow = {
  jobid: number;
  jobname: string;
  active: boolean;
  /** Run ordinati per start_time DESC (più recente prima). */
  runs: Array<{
    status: string;
    startTime: Date | null;
    returnMessage: string | null;
  }>;
};

/**
 * Logica pura: dato lo snapshot dei job + run più recenti, ritorna
 * i candidati. Esposta per essere testata senza DB.
 */
export function computeCronFailureCandidates(
  jobs: CronJobRow[],
  buildLink: (jobname: string) => string,
): NotificationCandidate[] {
  const out: NotificationCandidate[] = [];

  for (const job of jobs) {
    if (!job.active) continue;
    if (job.runs.length === 0) continue;

    const latest = job.runs[0];
    if (latest.status.toLowerCase() !== "failed") continue;

    let consecutive = 0;
    for (const r of job.runs) {
      if (r.status.toLowerCase() === "failed") consecutive++;
      else break;
    }

    const severity: NotificationSeverity =
      consecutive >= CRITICAL_THRESHOLD ? "critical" : "warning";

    const meta = getCronJobMeta(job.jobname);
    const label = meta?.label ?? job.jobname;
    const purpose = meta?.purpose;
    const lastError = latest.returnMessage?.trim() || null;

    const bodyParts: string[] = [];
    bodyParts.push(
      consecutive === 1
        ? `Last run failed at ${formatTime(latest.startTime)}.`
        : `${consecutive} consecutive failures, latest at ${formatTime(latest.startTime)}.`,
    );
    if (lastError) bodyParts.push(`Error: ${truncate(lastError, 240)}`);
    if (purpose) bodyParts.push(purpose);

    out.push({
      type: CRON_FAILURE_TYPE,
      severity,
      title: `Cron failed — ${label}`,
      body: bodyParts.join(" · "),
      link: buildLink(job.jobname),
      dedupKey: `cron-failure:${job.jobname}`,
      metadata: {
        jobname: job.jobname,
        jobid: job.jobid,
        consecutiveFailures: consecutive,
        lastErrorMessage: lastError,
      },
    });
  }

  return out;
}

function formatTime(d: Date | null): string {
  if (!d) return "unknown";
  return d.toISOString().replace("T", " ").replace(/\.\d+Z$/, "Z");
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

// ─────────────────────────────────────────────────────────────────────
// DB access
// ─────────────────────────────────────────────────────────────────────

/**
 * Carica jobs + ultimi 10 run per ogni jobname richiesto. Filtro
 * jobname-based per non incrociare job di altri moduli/generator.
 *
 * Nota: pg_cron espone cron.job e cron.job_run_details solo al ruolo
 * postgres (la connessione Drizzle attuale). Errori sono inghiottiti
 * dal dispatcher: se la query rompe non emettiamo candidati e nessuna
 * notifica esistente viene auto-resolved per errore.
 */
async function fetchJobsWithRuns(jobnames: string[]): Promise<CronJobRow[]> {
  if (jobnames.length === 0) return [];

  // NB: NON usiamo `ANY(${jobnames}::text[])`. Drizzle 0.45 espande gli
  // array JS in placeholder multipli `($1, $2, $3)`, e Postgres parsa
  // quella tupla come record — il cast `record::text[]` fallisce con
  // "cannot cast type record to text[]" (#194 ci aveva provato a fixare
  // col cast esplicito, ma il bug è prima del cast). Usiamo `IN (...)`
  // con `sql.join` che produce SQL valido senza dipendere dal binding
  // di array nativi PG.
  const inList = sql.join(
    jobnames.map((n) => sql`${n}`),
    sql`, `,
  );

  const rows = await db.execute(sql`
    SELECT
      j.jobid,
      j.jobname,
      j.active,
      r.status,
      r.start_time,
      r.return_message
    FROM cron.job j
    LEFT JOIN LATERAL (
      SELECT status, start_time, return_message
      FROM cron.job_run_details
      WHERE jobid = j.jobid
      ORDER BY start_time DESC NULLS LAST
      LIMIT 10
    ) r ON TRUE
    WHERE j.jobname IN (${inList})
    ORDER BY j.jobname, r.start_time DESC NULLS LAST
  `);

  type FlatRow = {
    jobid: number;
    jobname: string;
    active: boolean;
    status: string | null;
    start_time: Date | string | null;
    return_message: string | null;
  };

  const byJobname = new Map<string, CronJobRow>();
  for (const raw of rows as unknown as FlatRow[]) {
    let entry = byJobname.get(raw.jobname);
    if (!entry) {
      entry = {
        jobid: Number(raw.jobid),
        jobname: raw.jobname,
        active: Boolean(raw.active),
        runs: [],
      };
      byJobname.set(raw.jobname, entry);
    }
    if (raw.status) {
      entry.runs.push({
        status: String(raw.status),
        startTime: raw.start_time ? new Date(raw.start_time) : null,
        returnMessage: raw.return_message ?? null,
      });
    }
  }
  return Array.from(byJobname.values());
}

// ─────────────────────────────────────────────────────────────────────
// Factory + concrete generators
// ─────────────────────────────────────────────────────────────────────

interface FactoryArgs {
  requiredPermission: string;
  /** Set di jobname che questo generator possiede. Se vuoto, niente run. */
  jobnames: Set<string>;
  /** Sotto-path RELATIVO al base admin (es. "/settings/cron"). Risolto a
   *  runtime con `buildAdminPath()` dentro `run` per applicare lo slug
   *  pubblico configurato. */
  subPath: string;
}

function makeCronFailuresGenerator({
  requiredPermission,
  jobnames,
  subPath,
}: FactoryArgs): NotificationGenerator {
  return {
    type: CRON_FAILURE_TYPE,
    requiredPermission,
    run: async () => {
      if (jobnames.size === 0) return [];
      const [jobs, link] = await Promise.all([
        fetchJobsWithRuns(Array.from(jobnames)),
        buildAdminPath(subPath),
      ]);
      return computeCronFailureCandidates(jobs, () => link);
    },
  };
}

/** Generator core: job dichiarati core + eventuali "Untracked"
 *  presenti in pg_cron e non in nessun manifest. */
export const coreCronFailuresGenerator: NotificationGenerator = {
  type: CRON_FAILURE_TYPE,
  requiredPermission: "admin:settings",
  run: async () => {
    // I core jobnames sono noti staticamente; per gli "untracked"
    // dobbiamo prima leggere cron.job e filtrare via i moduli.
    const registered = getAllRegisteredJobnames();
    const allJobsRows = await db.execute(sql`
      SELECT jobname FROM cron.job WHERE jobname IS NOT NULL
    `);
    const allJobnames = new Set(
      (allJobsRows as unknown as Array<{ jobname: string }>).map((r) => r.jobname),
    );

    const moduleOwned = new Set<string>();
    for (const m of INSTALLED_MODULES) {
      for (const c of m.cronJobs) moduleOwned.add(c.jobname);
    }

    const coreNames = new Set(CORE_CRON_JOBS.map((c) => c.jobname));
    const untracked = new Set<string>();
    for (const n of allJobnames) {
      if (!registered.has(n) && !moduleOwned.has(n)) untracked.add(n);
    }

    const targets = new Set<string>([...coreNames, ...untracked]);
    if (targets.size === 0) return [];
    const [jobs, link] = await Promise.all([
      fetchJobsWithRuns(Array.from(targets)),
      buildAdminPath("/settings/cron"),
    ]);
    return computeCronFailureCandidates(jobs, () => link);
  },
};

/** Un generator per ogni modulo installato che dichiara cron job. */
export function moduleCronFailuresGenerators(): NotificationGenerator[] {
  return INSTALLED_MODULES.filter((m) => m.cronJobs.length > 0).map((m) =>
    makeCronFailuresGenerator({
      requiredPermission: m.permission,
      jobnames: getModuleJobnames(m.slug),
      subPath: `/modules/${m.slug}/cron`,
    }),
  );
}
