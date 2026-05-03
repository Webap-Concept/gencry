/**
 * lib/cron/registry.ts
 *
 * Registry dei metadati dei cron job noti al sistema. La fonte di
 * verità degli SCHEDULE e dello stato `active` resta `pg_cron`
 * (`cron.job`); qui teniamo solo i dati descrittivi (label, descrizione,
 * scopo) che servono alla UI admin e che pg_cron non conosce.
 *
 * Owner di un job:
 *   - "core"               → job di proprietà del core white-label
 *   - { module: "<slug>" } → job esposto da un modulo installato
 *
 * I job presenti in `cron.job` ma non in nessuno dei due elenchi
 * vengono mostrati nel core admin nella sezione "Untracked", così
 * non si perde nulla.
 */
import { INSTALLED_MODULES } from "@/lib/modules/registry";

export type CronOwner = "core" | { module: string };

export interface CronJobMeta {
  jobname: string;
  label: string;
  description: string;
  purpose: string;
  owner: CronOwner;
}

/** Job registrati dal core (non appartenenti a nessun modulo). */
export const CORE_CRON_JOBS: CronJobMeta[] = [
  {
    jobname: "gdpr-export-worker",
    label: "GDPR Export Worker",
    description: "Processes pending GDPR data-export jobs (max 5 per run) and deletes export files whose expires_at is past.",
    purpose: "Required by GDPR. Users can request a copy of their data from /settings/privacy; this cron generates the ZIP, emails the link to the user, and later cleans up expired files.",
    owner: "core",
  },
  {
    jobname: "sessions-cleanup",
    label: "Sessions Cleanup",
    description: "Deletes server-side session rows that are expired or have been revoked more than the grace window ago (DELETE FROM sessions WHERE expires_at < now() - interval '1 day' OR (revoked_at IS NOT NULL AND revoked_at < ...)).",
    purpose: "Keeps the sessions table bounded and removes stale records of logged-out / expired devices. Backs the active-sessions UI in /settings/security and the auto-logout-elsewhere flow.",
    owner: "core",
  },
  {
    jobname: "soft-deleted-purge",
    label: "Soft-deleted Account Purge",
    description: "Hard-deletes user rows that have been soft-deleted (deleted_at IS NOT NULL) for more than 30 days.",
    purpose: "Implements the GDPR 30-day grace window after an account-deletion request. Within 30 days the user can still recover the account; after that the row is purged and FK ON DELETE SET NULL preserves audit trails.",
    owner: "core",
  },
  {
    jobname: "notifications-dispatch",
    label: "Admin Notifications Dispatch",
    description: "Runs all notification generators (cron failures, secret rotation, …) and reconciles admin_notifications: inserts new alerts, refreshes severity, auto-resolves conditions that have cleared.",
    purpose: "Ensures admin alerts (e.g. a cron going into failure) appear within minutes instead of waiting for an admin to navigate the panel. The layout-render trigger still acts as a fallback if pg_cron is not running.",
    owner: "core",
  },
  {
    jobname: "sessions-suspicious-detection",
    label: "Suspicious Sessions Detection",
    description: "Runs the configured Tier-1 heuristics (multiple IPs, concurrent devices, bot UA, failed→success login, sensitive action on new IP, …) over recent sessions / login_attempts / activity_logs and persists candidates into session_alerts. Sends an email digest to admins when the schedule allows.",
    purpose: "Surfaces compromised or hijacked sessions early. Detect-only by default — alerts appear in /admin/access/sessions and trigger an admin notification + email digest, but do not auto-revoke sessions. Tunable from /admin/settings/notifications.",
    owner: "core",
  },
];

/** Costruisce l'elenco completo di metadati noti unendo core + moduli. */
export function getAllCronJobMeta(): CronJobMeta[] {
  const fromModules = INSTALLED_MODULES.flatMap<CronJobMeta>((m) =>
    m.cronJobs.map((c) => ({
      jobname: c.jobname,
      label: c.label,
      description: c.description,
      purpose: c.purpose,
      owner: { module: m.slug },
    })),
  );
  return [...CORE_CRON_JOBS, ...fromModules];
}

/** Lookup per jobname. Restituisce undefined se il job non è registrato. */
export function getCronJobMeta(jobname: string | null): CronJobMeta | undefined {
  if (!jobname) return undefined;
  return getAllCronJobMeta().find((m) => m.jobname === jobname);
}

/** Set dei jobname posseduti da un modulo specifico. */
export function getModuleJobnames(moduleSlug: string): Set<string> {
  const mod = INSTALLED_MODULES.find((m) => m.slug === moduleSlug);
  if (!mod) return new Set();
  return new Set(mod.cronJobs.map((c) => c.jobname));
}

/** Set dei jobname owned dal core. */
export function getCoreJobnames(): Set<string> {
  return new Set(CORE_CRON_JOBS.map((c) => c.jobname));
}

/** Set di TUTTI i jobname registrati (core + moduli). Usato per
 *  identificare i job "Untracked" presenti su pg_cron ma non in
 *  nessun registro. */
export function getAllRegisteredJobnames(): Set<string> {
  return new Set(getAllCronJobMeta().map((m) => m.jobname));
}
