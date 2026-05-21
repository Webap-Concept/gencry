// lib/account/gdpr-export.ts
//
// Logica di export GDPR async: il cron worker pesca i job pending,
// raccoglie i dati core dell'utente, li serializza in JSON, li carica
// nel bucket privato, manda l'email con la signed URL e marca il job
// `ready`. Lo schema dell'export è versionato (`schemaVersion`) così
// possiamo aggiungere campi (es. social) senza rompere consumer storici.

import "server-only";
import { db } from "@/lib/db/drizzle";
import {
  activityLogs,
  gdprExportJobs,
  notifications,
  oauthAccounts,
  trustedDevices,
  userProfiles,
  users,
  userSubscriptions,
} from "@/lib/db/schema";
import { and, desc, eq, gt, inArray, lt, sql } from "drizzle-orm";
import { getAppSettings } from "@/lib/db/settings-queries";
import { uploadGdprExport, getGdprExportSignedUrl, deleteGdprExport } from "@/lib/storage/gdpr-exports";
import { sendGdprExportReadyEmail } from "@/lib/email/templates/gdpr-export-ready";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/config";
import { MODULE_GDPR_EXPORTS } from "@/lib/modules/gdpr-export-registry";

/** Schema dell'export — bumpare a ogni breaking change del payload.
 *  v1: user/profile/subscription/oauth/devices/consents/activityLogs.
 *  v2 (mag 2026): aggiunti `notifications` e `modules.<key>` (hook GDPR
 *  per modulo via MODULE_GDPR_EXPORTS — posts + futuri). */
export const GDPR_EXPORT_SCHEMA_VERSION = 2;

/** Tetto sui record di activity log inclusi nell'export. */
const ACTIVITY_LOGS_LIMIT = 5000;
/** Tetto su notifications incluse. Stesso ordine di grandezza di
 *  activityLogs: la maggior parte degli utenti ne ha <500, ma utenti
 *  attivi sui post possono accumulare velocemente. */
const NOTIFICATIONS_LIMIT = 5000;

/** Giorni di vita del file nel bucket prima del purge. */
export const GDPR_EXPORT_RETENTION_DAYS = 7;

/** Quanti job pending processare per chiamata cron. */
const PROCESS_BATCH_SIZE = 5;

/**
 * Rate-limit per la richiesta utente: blocca un nuovo export se esiste
 * già un job recente non concluso negativamente. La logica:
 * - Job `pending`/`processing` esistente → "ne hai già uno in corso"
 * - Job `ready` non scaduto → "ne hai già uno scaricabile"
 * - Job `failed`/`expired` → ignorati (può rifare subito)
 *
 * Inoltre, indipendentemente dallo stato, max 1 job ogni N giorni dalla
 * `requestedAt`: anti-abuso lato storage e CPU. N è configurabile
 * dall'admin (`gdpr.export.rate_limit_days`), default 7.
 */
const REQUEST_THROTTLE_DAYS_DEFAULT = 7;

async function getRequestThrottleDays(): Promise<number> {
  try {
    const settings = await getAppSettings();
    const raw = settings["gdpr.export.rate_limit_days"];
    const n = raw != null ? Number.parseInt(raw, 10) : NaN;
    if (Number.isFinite(n) && n >= 0) return n;
  } catch (err) {
    console.error("[gdpr-export] reading rate_limit_days setting failed:", err);
  }
  return REQUEST_THROTTLE_DAYS_DEFAULT;
}

// ---------------------------------------------------------------------------
// Raccolta dati GDPR
// ---------------------------------------------------------------------------

/**
 * Ritorna l'oggetto serializzabile da uppload nel bucket. Niente segreti
 * (passwordHash, oauth tokens, deviceToken). Activity logs troncati per
 * non generare JSON multi-MB; un consumer che vuole il completo deve
 * passare per richieste dedicate (TODO se mai servirà).
 */
export async function collectGdprUserData(userId: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) {
    throw new Error(`[gdpr-export] user ${userId} not found`);
  }

  const [profile] = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);

  const [subscription] = await db
    .select()
    .from(userSubscriptions)
    .where(eq(userSubscriptions.userId, userId))
    .limit(1);

  const oauth = await db
    .select({
      provider: oauthAccounts.provider,
      providerAccountId: oauthAccounts.providerAccountId,
      scope: oauthAccounts.scope,
      createdAt: oauthAccounts.createdAt,
      updatedAt: oauthAccounts.updatedAt,
    })
    .from(oauthAccounts)
    .where(eq(oauthAccounts.userId, userId));

  const devices = await db
    .select({
      userAgent: trustedDevices.userAgent,
      createdAt: trustedDevices.createdAt,
      lastUsedAt: trustedDevices.lastUsedAt,
    })
    .from(trustedDevices)
    .where(eq(trustedDevices.userId, userId));

  const logs = await db
    .select({
      action: activityLogs.action,
      timestamp: activityLogs.timestamp,
      ipAddress: activityLogs.ipAddress,
    })
    .from(activityLogs)
    .where(eq(activityLogs.userId, userId))
    .orderBy(desc(activityLogs.timestamp))
    .limit(ACTIVITY_LOGS_LIMIT + 1);

  const truncatedLogs = logs.length > ACTIVITY_LOGS_LIMIT;

  // Notifications storiche ricevute dall'utente. actorId/postId/commentId
  // li includiamo as-is: sono riferimenti opachi a contenuti che possono
  // benissimo essere stati cancellati nel frattempo. Non leakkiamo body
  // di contenuti di terzi.
  const notifs = await db
    .select({
      id: notifications.id,
      type: notifications.type,
      actorId: notifications.actorId,
      postId: notifications.postId,
      commentId: notifications.commentId,
      payload: notifications.payload,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(NOTIFICATIONS_LIMIT + 1);

  const truncatedNotifs = notifs.length > NOTIFICATIONS_LIMIT;

  // Collector per modulo: ogni modulo installato che ha dichiarato un
  // ModuleGdprExport contribuisce con la propria sezione sotto
  // `modules.<key>`. Promise.allSettled: un modulo che fallisce
  // (es. tabella mancante in env staging) non deve abbattere l'intero
  // export — la sezione del modulo cade a `null` con un campo `error`.
  const moduleResults = await Promise.allSettled(
    MODULE_GDPR_EXPORTS.map(async (mod) => {
      const loaded = await mod.loadCollector();
      const data = await loaded.default(userId);
      return { key: mod.key, data };
    }),
  );

  const modules: Record<string, unknown> = {};
  for (let i = 0; i < moduleResults.length; i++) {
    const result = moduleResults[i];
    const meta = MODULE_GDPR_EXPORTS[i];
    if (result.status === "fulfilled") {
      modules[result.value.key] = result.value.data;
    } else {
      const message =
        result.reason instanceof Error
          ? result.reason.message
          : String(result.reason);
      console.error(
        `[gdpr-export] module collector "${meta.key}" failed:`,
        result.reason,
      );
      modules[meta.key] = { error: message };
    }
  }

  // Sanitizza il payload: passwordHash via, oauth tokens via, device_token via.
  const { passwordHash: _ph, ...userPublic } = user;

  return {
    schemaVersion: GDPR_EXPORT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    user: userPublic,
    profile: profile ?? null,
    subscription: subscription ?? null,
    oauthAccounts: oauth,
    trustedDevices: devices,
    consents: {
      terms: {
        acceptedAt: user.acceptedTermsAt,
        version: user.acceptedTermsVersion,
      },
      privacy: {
        acceptedAt: user.acceptedPrivacyAt,
        version: user.acceptedPrivacyVersion,
      },
      marketing: {
        acceptedAt: user.acceptedMarketingAt,
        version: user.acceptedMarketingVersion,
      },
    },
    activityLogs: {
      items: logs.slice(0, ACTIVITY_LOGS_LIMIT),
      truncated: truncatedLogs,
      limit: ACTIVITY_LOGS_LIMIT,
    },
    notifications: {
      items: notifs.slice(0, NOTIFICATIONS_LIMIT),
      truncated: truncatedNotifs,
      limit: NOTIFICATIONS_LIMIT,
    },
    modules,
  };
}

// ---------------------------------------------------------------------------
// Cron worker
// ---------------------------------------------------------------------------

export type CronRunResult = {
  processed: { jobId: string; userId: string; ok: boolean; error?: string }[];
  expired: { jobId: string; storagePath: string }[];
};

/**
 * Pesca fino a PROCESS_BATCH_SIZE job pending, li processa serialmente
 * (l'email è il rate-limiter naturale: Resend impone limiti per secondo,
 * non vogliamo competere con altri sender). Inoltre passa al cleanup
 * dei job scaduti.
 *
 * Il cron è triggered da Supabase pg_cron via http GET (vedi
 * /api/cron/account/gdpr-export/route.ts e isAuthorizedCron).
 */
export async function runGdprExportCron(): Promise<CronRunResult> {
  const result: CronRunResult = { processed: [], expired: [] };

  // 1) PROCESSING — claim atomicamente con FOR UPDATE SKIP LOCKED per evitare
  //    che due crontab concorrenti elaborino lo stesso job.
  const claimed = await claimPendingJobs(PROCESS_BATCH_SIZE);
  for (const job of claimed) {
    const outcome = await processOne(job.id, job.userId);
    result.processed.push({
      jobId: job.id,
      userId: job.userId,
      ok: outcome.ok,
      error: outcome.ok ? undefined : outcome.error,
    });
  }

  // 2) CLEANUP file scaduti (status='ready' AND expires_at < now()).
  const toExpire = await db
    .select({
      id: gdprExportJobs.id,
      storagePath: gdprExportJobs.storagePath,
    })
    .from(gdprExportJobs)
    .where(
      and(
        eq(gdprExportJobs.status, "ready"),
        lt(gdprExportJobs.expiresAt, new Date()),
      ),
    )
    .limit(50);

  for (const job of toExpire) {
    if (job.storagePath) {
      await deleteGdprExport(job.storagePath);
    }
    await db
      .update(gdprExportJobs)
      .set({ status: "expired" })
      .where(eq(gdprExportJobs.id, job.id));
    result.expired.push({
      jobId: job.id,
      storagePath: job.storagePath ?? "",
    });
  }

  return result;
}

/**
 * Drizzle non ha helper per `FOR UPDATE SKIP LOCKED`, quindi usiamo SQL
 * raw — è un pattern Postgres standard per worker queue. La transazione
 * garantisce che `started_at` venga settato atomicamente con il claim.
 */
async function claimPendingJobs(
  limit: number,
): Promise<{ id: string; userId: string }[]> {
  const rows = await db.execute<{ id: string; user_id: string }>(sql`
    UPDATE gdpr_export_jobs
       SET status = 'processing',
           started_at = now()
     WHERE id IN (
       SELECT id
         FROM gdpr_export_jobs
        WHERE status = 'pending'
        ORDER BY requested_at ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
     )
    RETURNING id, user_id
  `);

  // postgres.js ritorna direttamente un array iterabile.
  return Array.from(rows as unknown as Array<{ id: string; user_id: string }>).map(
    (r) => ({ id: r.id, userId: r.user_id }),
  );
}

async function processOne(
  jobId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const payload = await collectGdprUserData(userId);
    const upload = await uploadGdprExport({ jobId, userId, payload });
    if (!upload.ok) {
      await markFailed(jobId, `upload: ${upload.error}`);
      return { ok: false, error: upload.error };
    }

    const signedUrl = await getGdprExportSignedUrl(upload.path);
    if (!signedUrl) {
      await markFailed(jobId, "signed-url generation failed");
      return { ok: false, error: "signed-url generation failed" };
    }

    // Email all'indirizzo dell'utente. Se Resend fallisce, il job resta
    // 'ready' (il file è stato caricato) e l'utente può comunque ri-scaricare
    // dalla UI delle impostazioni: l'email è una comodità, non l'unico canale.
    let emailSentAt: Date | null = null;
    try {
      const locale = isLocale(payload.user.locale)
        ? payload.user.locale
        : DEFAULT_LOCALE;
      await sendGdprExportReadyEmail({
        toEmail: payload.user.email,
        firstName: payload.profile?.firstName ?? null,
        downloadUrl: signedUrl,
        locale,
      });
      emailSentAt = new Date();
    } catch (err) {
      console.error("[gdpr-export] email send failed:", err);
    }

    const requestedAt = new Date();
    const expiresAt = new Date(
      requestedAt.getTime() + GDPR_EXPORT_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );

    await db
      .update(gdprExportJobs)
      .set({
        status: "ready",
        completedAt: new Date(),
        storagePath: upload.path,
        expiresAt,
        emailSentAt,
      })
      .where(eq(gdprExportJobs.id, jobId));

    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await markFailed(jobId, message);
    return { ok: false, error: message };
  }
}

async function markFailed(jobId: string, error: string) {
  await db
    .update(gdprExportJobs)
    .set({
      status: "failed",
      completedAt: new Date(),
      error: error.slice(0, 1000),
    })
    .where(eq(gdprExportJobs.id, jobId));
}

// ---------------------------------------------------------------------------
// API per la UI utente in /settings/privacy
// ---------------------------------------------------------------------------

export type RequestExportResult =
  | { ok: true; jobId: string }
  | { ok: false; error: string };

/**
 * Richiesta utente di un nuovo export. Applica il rate-limit, crea la
 * row `pending` e ritorna l'id del job. Il processing avviene async dal
 * cron worker (vedi runGdprExportCron).
 */
export async function requestGdprExport(
  userId: string,
): Promise<RequestExportResult> {
  // Job già "in lavorazione" o ancora scaricabili → blocca subito con
  // messaggio specifico, senza scomodare il throttle generale.
  const [active] = await db
    .select({ id: gdprExportJobs.id, status: gdprExportJobs.status })
    .from(gdprExportJobs)
    .where(
      and(
        eq(gdprExportJobs.userId, userId),
        inArray(gdprExportJobs.status, ["pending", "processing", "ready"]),
      ),
    )
    .limit(1);

  if (active) {
    if (active.status === "ready") {
      return {
        ok: false,
        error:
          "Hai già un export pronto: scaricalo o aspetta che scada per richiederne uno nuovo.",
      };
    }
    return {
      ok: false,
      error:
        "Hai già una richiesta di export in elaborazione. Riceverai una mail quando sarà pronta.",
    };
  }

  // Throttle anti-abuso: max 1 richiesta ogni N giorni a prescindere
  // dallo stato (anche failed/expired contano qui). N viene dall'admin
  // setting `gdpr.export.rate_limit_days` (default 7).
  const throttleDays = await getRequestThrottleDays();
  const cutoff = new Date(
    Date.now() - throttleDays * 24 * 60 * 60 * 1000,
  );
  const [recent] = await db
    .select({ requestedAt: gdprExportJobs.requestedAt })
    .from(gdprExportJobs)
    .where(
      and(
        eq(gdprExportJobs.userId, userId),
        gt(gdprExportJobs.requestedAt, cutoff),
      ),
    )
    .orderBy(desc(gdprExportJobs.requestedAt))
    .limit(1);

  if (recent) {
    const nextAt = new Date(
      recent.requestedAt.getTime() + throttleDays * 24 * 60 * 60 * 1000,
    );
    return {
      ok: false,
      error: `Puoi richiedere un nuovo export dopo il ${nextAt.toLocaleDateString("it-IT")}.`,
    };
  }

  const [created] = await db
    .insert(gdprExportJobs)
    .values({ userId })
    .returning({ id: gdprExportJobs.id });

  return { ok: true, jobId: created.id };
}

export type UserExportJob = {
  id: string;
  status: (typeof gdprExportJobs.$inferSelect)["status"];
  requestedAt: Date;
  completedAt: Date | null;
  expiresAt: Date | null;
  hasFile: boolean;
};

/**
 * Lista degli ultimi N job dell'utente, ordinati dal più recente.
 * Usata per popolare la lista sotto il bottone "Richiedi esportazione".
 */
export async function listMyExportJobs(
  userId: string,
  limit = 5,
): Promise<UserExportJob[]> {
  const rows = await db
    .select({
      id: gdprExportJobs.id,
      status: gdprExportJobs.status,
      requestedAt: gdprExportJobs.requestedAt,
      completedAt: gdprExportJobs.completedAt,
      expiresAt: gdprExportJobs.expiresAt,
      storagePath: gdprExportJobs.storagePath,
    })
    .from(gdprExportJobs)
    .where(eq(gdprExportJobs.userId, userId))
    .orderBy(desc(gdprExportJobs.requestedAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    requestedAt: r.requestedAt,
    completedAt: r.completedAt,
    expiresAt: r.expiresAt,
    hasFile: r.storagePath !== null,
  }));
}

/**
 * Genera una signed URL fresca per un job `ready` non scaduto. Verifica
 * l'ownership: un utente può scaricare solo i propri export.
 * Il link in email può scadere a 24h: questa funzione permette di
 * rigenerarne una dalle impostazioni finché il file vive nel bucket.
 */
export async function regenerateDownloadUrl(params: {
  userId: string;
  jobId: string;
}): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const { userId, jobId } = params;

  const [job] = await db
    .select({
      status: gdprExportJobs.status,
      storagePath: gdprExportJobs.storagePath,
      expiresAt: gdprExportJobs.expiresAt,
    })
    .from(gdprExportJobs)
    .where(
      and(eq(gdprExportJobs.id, jobId), eq(gdprExportJobs.userId, userId)),
    )
    .limit(1);

  if (!job) return { ok: false, error: "Export non trovato." };
  if (job.status !== "ready" || !job.storagePath) {
    return { ok: false, error: "Questo export non è scaricabile." };
  }
  if (job.expiresAt && job.expiresAt.getTime() < Date.now()) {
    return { ok: false, error: "Questo export è scaduto." };
  }

  const url = await getGdprExportSignedUrl(job.storagePath);
  if (!url) {
    return { ok: false, error: "Impossibile generare il link al momento." };
  }
  return { ok: true, url };
}
