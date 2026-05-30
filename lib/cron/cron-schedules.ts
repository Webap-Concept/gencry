// lib/cron/cron-schedules.ts
//
// Single source of truth degli schedule cron PER QSTASH. Plain data, zero
// import (importabile sia dallo script tsx `scripts/qstash-sync-schedules.ts`
// sia dall'app). I `cronJobs` nei manifest dei moduli restano per il display
// admin — il loro tipo già dichiara "Solo display: la fonte di verità è
// cron.job.schedule"; dopo la migrazione la verità è QUESTA lista.
//
// `jobname` è l'ID stabile: lo script lo passa come `Upstash-Schedule-Id`
// (prefisso `gencry-`) così ri-eseguire lo script AGGIORNA lo schedule
// invece di crearne un duplicato.
//
// Cadenze allineate ai manifest dei moduli + ai commenti pg_cron dei route
// core. Modificare qui = singolo punto; poi `pnpm cron:sync` riallinea QStash.

export interface CronScheduleDef {
  /** ID stabile → QStash `Upstash-Schedule-Id` (idempotenza upsert). */
  jobname: string;
  /** Path root-relative dell'endpoint cron Next. */
  path: string;
  /** Cron expression standard (5 campi). */
  schedule: string;
}

export const CRON_SCHEDULES: CronScheduleDef[] = [
  // ── Prices (modulo) ──
  { jobname: "prices-sync", path: "/api/cron/modules/prices/sync", schedule: "*/1 * * * *" },
  { jobname: "prices-snapshot", path: "/api/cron/modules/prices/snapshot", schedule: "*/5 * * * *" },
  { jobname: "prices-cleanup", path: "/api/cron/modules/prices/cleanup", schedule: "0 3 * * *" },
  { jobname: "prices-metadata-refresh", path: "/api/cron/modules/prices/metadata-refresh", schedule: "0 */4 * * *" },

  // ── News (modulo) ──
  { jobname: "news-ingestion", path: "/api/cron/modules/news/ingestion", schedule: "*/15 * * * *" },
  { jobname: "news-rewrite", path: "/api/cron/modules/news/rewrite", schedule: "*/5 * * * *" },
  { jobname: "news-publisher", path: "/api/cron/modules/news/publisher", schedule: "*/15 * * * *" },
  { jobname: "news-cleanup-proposed", path: "/api/cron/modules/news/cleanup-proposed", schedule: "0 3 * * *" },

  // ── Notifications ──
  { jobname: "notifications-achievement-email", path: "/api/cron/modules/notifications/achievement-email", schedule: "*/20 * * * *" },
  { jobname: "notifications-retention-cleanup", path: "/api/cron/modules/notifications/retention-cleanup", schedule: "30 4 * * *" },
  { jobname: "notifications-dispatch", path: "/api/cron/notifications/dispatch", schedule: "*/5 * * * *" },
  { jobname: "notifications-email-dispatch", path: "/api/cron/notifications/email-dispatch", schedule: "*/5 * * * *" },

  // ── Posts (modulo) — cleanup notturni sfasati ──
  { jobname: "posts-cleanup-orphan-media", path: "/api/cron/modules/posts/cleanup-orphan-media", schedule: "0 3 * * *" },
  { jobname: "posts-cleanup-outbox", path: "/api/cron/modules/posts/cleanup-outbox", schedule: "0 4 * * *" },
  { jobname: "posts-hard-delete-deleted", path: "/api/cron/modules/posts/hard-delete-deleted", schedule: "0 5 * * *" },

  // ── Account / GDPR (core) ──
  // 1×/giorno: la legge impone consegna entro 30 giorni dalla richiesta.
  // Frequenza più alta (*/5) non ha senso operativo e spreca invocazioni.
  { jobname: "gdpr-export-worker", path: "/api/cron/account/gdpr-export", schedule: "0 3 * * *" },
  { jobname: "consent-records-cleanup", path: "/api/cron/account/consent-records-cleanup", schedule: "0 3 * * *" },
  { jobname: "policy-change-notifications", path: "/api/cron/account/policy-change-notifications", schedule: "0 * * * *" },

  // ── Security / Sessions (core) ──
  { jobname: "security-ip-rules", path: "/api/cron/security/ip-rules", schedule: "*/10 * * * *" },
  { jobname: "sessions-suspicious", path: "/api/cron/sessions/suspicious", schedule: "*/15 * * * *" },
];
