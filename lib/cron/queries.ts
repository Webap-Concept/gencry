/**
 * lib/cron/queries.ts
 *
 * Read/write helpers per le tabelle dell'extension `pg_cron` di Postgres
 * (Supabase). Si appoggia alla connessione Drizzle esistente
 * (`POSTGRES_URL` → ruolo `postgres`), che è l'unico ruolo con accesso
 * diretto a `cron.job` / `cron.job_run_details` su Supabase.
 *
 * IMPORTANTE: ogni chiamata a queste funzioni va eseguita SOLO dietro
 * RBAC server-side (es. `requireAdminSectionPage("admin:settings")`).
 * Non c'è una seconda barriera a livello DB.
 */
import "server-only";
import { db } from "@/lib/db/drizzle";
import { sql } from "drizzle-orm";

export type PgCronJob = {
  jobid: number;
  jobname: string | null;
  schedule: string;
  command: string;
  active: boolean;
  database: string;
  username: string;
};

export type PgCronRun = {
  runid: number;
  jobid: number;
  status: string;
  returnMessage: string | null;
  startTime: Date | null;
  endTime: Date | null;
  durationMs: number | null;
};

export type PgCronJobWithLastRun = PgCronJob & {
  lastRun: PgCronRun | null;
};

/** Lista tutti i job registrati in `cron.job`, ordinati per nome. */
export async function listCronJobs(): Promise<PgCronJob[]> {
  const rows = await db.execute(sql`
    SELECT
      jobid,
      jobname,
      schedule,
      command,
      active,
      database,
      username
    FROM cron.job
    ORDER BY jobname NULLS LAST, jobid
  `);
  return (rows as unknown as PgCronJob[]).map(normalizeJob);
}

/** Stessa lista, ma con annesso l'ultimo run (latest entry da
 *  `cron.job_run_details`) per ogni job. Usato dalla tabella admin per
 *  mostrare lo stato a colpo d'occhio. */
export async function listCronJobsWithLastRun(): Promise<PgCronJobWithLastRun[]> {
  const rows = await db.execute(sql`
    SELECT
      j.jobid,
      j.jobname,
      j.schedule,
      j.command,
      j.active,
      j.database,
      j.username,
      r.runid          AS last_runid,
      r.status         AS last_status,
      r.return_message AS last_return_message,
      r.start_time     AS last_start_time,
      r.end_time       AS last_end_time
    FROM cron.job j
    LEFT JOIN LATERAL (
      SELECT runid, status, return_message, start_time, end_time
      FROM cron.job_run_details
      WHERE jobid = j.jobid
      ORDER BY start_time DESC NULLS LAST
      LIMIT 1
    ) r ON TRUE
    ORDER BY j.jobname NULLS LAST, j.jobid
  `);

  type Row = PgCronJob & {
    last_runid: number | null;
    last_status: string | null;
    last_return_message: string | null;
    last_start_time: Date | string | null;
    last_end_time: Date | string | null;
  };

  return (rows as unknown as Row[]).map((r) => {
    const job = normalizeJob(r);
    const lastRun: PgCronRun | null = r.last_runid != null
      ? normalizeRun({
          runid: r.last_runid,
          jobid: r.jobid,
          status: r.last_status ?? "unknown",
          return_message: r.last_return_message,
          start_time: r.last_start_time,
          end_time: r.last_end_time,
        })
      : null;
    return { ...job, lastRun };
  });
}

/** Ultimi N run di un singolo job, più recente prima. */
export async function getRecentRuns(jobid: number, limit = 20): Promise<PgCronRun[]> {
  const rows = await db.execute(sql`
    SELECT
      runid,
      jobid,
      status,
      return_message,
      start_time,
      end_time
    FROM cron.job_run_details
    WHERE jobid = ${jobid}
    ORDER BY start_time DESC NULLS LAST
    LIMIT ${limit}
  `);
  return (rows as unknown as Array<{
    runid: number;
    jobid: number;
    status: string;
    return_message: string | null;
    start_time: Date | string | null;
    end_time: Date | string | null;
  }>).map(normalizeRun);
}

/** Enable/disable di un job via `cron.alter_job`. Non rimuove il job:
 *  un job disabilitato resta in `cron.job` con `active = false`. */
export async function setCronJobActive(jobid: number, active: boolean): Promise<void> {
  await db.execute(sql`SELECT cron.alter_job(job_id => ${jobid}, active => ${active})`);
}

// ─────────────────────────────────────────────────────────────────────
// helpers
// ─────────────────────────────────────────────────────────────────────

function normalizeJob(r: PgCronJob): PgCronJob {
  return {
    jobid: Number(r.jobid),
    jobname: r.jobname ?? null,
    schedule: String(r.schedule),
    command: String(r.command),
    active: Boolean(r.active),
    database: String(r.database),
    username: String(r.username),
  };
}

function normalizeRun(r: {
  runid: number;
  jobid: number;
  status: string;
  return_message: string | null;
  start_time: Date | string | null;
  end_time: Date | string | null;
}): PgCronRun {
  const start = r.start_time ? new Date(r.start_time) : null;
  const end = r.end_time ? new Date(r.end_time) : null;
  const durationMs =
    start && end ? end.getTime() - start.getTime() : null;
  return {
    runid: Number(r.runid),
    jobid: Number(r.jobid),
    status: String(r.status),
    returnMessage: r.return_message ?? null,
    startTime: start,
    endTime: end,
    durationMs,
  };
}
