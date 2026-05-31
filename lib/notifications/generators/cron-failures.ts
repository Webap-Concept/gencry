/**
 * Generator: alert per cron job in errore.
 *
 * Sorgente: la Dead Letter Queue di QStash. Dopo la migrazione da pg_cron,
 * i cron girano come schedule QStash che chiamano `/api/cron/*`; quando una
 * invocazione esaurisce i retry QStash la sposta in DLQ. Una entry DLQ =
 * un fallimento PERSISTENTE (non un blip). Mappiamo ogni entry recente
 * (finestra `DLQ_LOOKBACK_MS`) nella shape `CronJobRow` come run "failed",
 * così la logica pura `computeCronFailureCandidates` resta invariata. Quando
 * le entry invecchiano oltre la finestra, l'auto-resolve del dispatcher
 * chiude la notifica.
 *
 * Scoping: il framework supporta un solo `requiredPermission` per
 * generator. Per rispettare la separazione core/moduli, esponiamo
 * un factory `makeCronFailuresGenerator` e registriamo:
 *   - 1 generator "core" (admin:settings) → job non posseduti da moduli
 *   - 1 generator per modulo installato (modules:<slug>) → solo job
 *     posseduti dal modulo
 * Tutti i generator condividono lo stesso `type` (cron_job_failure)
 * così l'auto-resolve del dispatcher li tratta come un'unica
 * collezione. La DLQ è letta una sola volta per tick (React.cache).
 */
import { buildAdminPath } from "@/lib/admin-paths";
import { getCronJobMeta, getModuleJobnames } from "@/lib/cron/registry";
import {
  getDlqFailuresByJobname,
  type QStashDlqFailure,
} from "@/lib/cron/qstash-client";
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
        // Esposti per il rendering i18n (vedi NOTIFICATION_REGISTRY).
        label,
        latestTime: formatTime(latest.startTime),
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
// DLQ access (QStash)
// ─────────────────────────────────────────────────────────────────────

/**
 * Adatta i fallimenti DLQ di QStash nella shape `CronJobRow` attesa dalla
 * logica pura. In DLQ ci sono SOLO fallimenti (mai successi): ogni entry
 * diventa un run `status: "failed"`. Il conteggio `consecutive` calcolato a
 * valle = numero di fallimenti recenti nella finestra. Filtra per i jobname
 * di competenza del generator chiamante.
 */
function dlqToRows(
  jobnames: Set<string>,
  dlqByJob: Map<string, QStashDlqFailure[]>,
): CronJobRow[] {
  const rows: CronJobRow[] = [];
  for (const name of jobnames) {
    const failures = dlqByJob.get(name);
    if (!failures || failures.length === 0) continue;
    rows.push({
      jobid: 0, // QStash non ha un jobid numerico; il jobname è l'identità.
      jobname: name,
      active: true,
      runs: failures.map((f) => ({
        status: "failed",
        startTime: new Date(f.createdAt),
        returnMessage:
          f.responseStatus !== null
            ? `HTTP ${f.responseStatus}${f.responseBody ? ` — ${f.responseBody}` : ""}`
            : (f.responseBody ?? null),
      })),
    });
  }
  return rows;
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
      const [dlqByJob, link] = await Promise.all([
        getDlqFailuresByJobname(),
        buildAdminPath(subPath),
      ]);
      return computeCronFailureCandidates(
        dlqToRows(jobnames, dlqByJob),
        () => link,
      );
    },
  };
}

/** Generator core: tutti i fallimenti DLQ NON posseduti da un modulo
 *  installato (= job core + eventuali schedule "untracked" non in nessun
 *  manifest). I job dei moduli sono coperti dai rispettivi generator. */
export const coreCronFailuresGenerator: NotificationGenerator = {
  type: CRON_FAILURE_TYPE,
  requiredPermission: "admin:settings",
  run: async () => {
    const [dlqByJob, link] = await Promise.all([
      getDlqFailuresByJobname(),
      buildAdminPath("/settings/cron"),
    ]);

    const moduleOwned = new Set<string>();
    for (const m of INSTALLED_MODULES) {
      for (const c of m.cronJobs) moduleOwned.add(c.jobname);
    }

    // Il core prende ogni fallimento DLQ che nessun modulo possiede.
    const coreTargets = new Set<string>();
    for (const jobname of dlqByJob.keys()) {
      if (!moduleOwned.has(jobname)) coreTargets.add(jobname);
    }
    if (coreTargets.size === 0) return [];

    return computeCronFailureCandidates(
      dlqToRows(coreTargets, dlqByJob),
      () => link,
    );
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
