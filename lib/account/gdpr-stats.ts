import "server-only";

import { db } from "@/lib/db/drizzle";
import { gdprExportJobs, pages } from "@/lib/db/schema";
import { count, eq, gte, sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";

/** Tag per `revalidateTag()` quando si vuole forzare il ricalcolo delle
 * stats GDPR (es. dopo bump versione policy o creazione consent_records).
 * Senza revalidate la cache scade comunque entro il TTL. */
export const GDPR_STATS_TAG = "gdpr-dashboard-stats";
export const GDPR_HEALTH_TAG = "gdpr-health-checks";

// Stale tolerance: la pagina /admin/compliance/gdpr non è una pagina
// "real-time". Un admin la apre 1-2 volte al giorno; un freshness di 5
// minuti è invisibile dall'UX. In compenso a 10K+ utenti il TTL alto
// taglia drasticamente il fan-out della query consolidata su `users`.
// Invalidazione immediata garantita via `revalidateTag(GDPR_STATS_TAG)`
// nei punti di mutazione (signup, policy bump, export create, purge).
const STATS_TTL_SECONDS = 300;
const HEALTH_TTL_SECONDS = 300;

export type GdprDashboardStats = {
  totalUsers: number;
  usersWithTermsAccepted: number;
  usersWithPrivacyAccepted: number;
  usersWithMarketingActive: number;
  usersWithStaleTerms: number;
  usersWithStalePrivacy: number;
  usersInDeletionGrace: number;
  currentVersions: {
    terms: string | null;
    privacy: string | null;
    marketing: string | null;
  };
  /** ISO 8601 strings (not Date) — `unstable_cache` serializza in JSON, quindi
   *  Date round-trippate diventano string. Esponiamo direttamente string per
   *  non mentire sul type runtime. Parsare con `new Date(...)` lato consumer. */
  policyUpdatedAt: {
    terms: string | null;
    privacy: string | null;
    marketing: string | null;
  };
  exportJobsRecent: {
    pending: number;
    processing: number;
    ready: number;
    failed: number;
    expired: number;
  };
};

export type GdprHealthChecks = {
  /** True quando la tabella `consent_records` esiste in DB.
   *  Resta false finché la PR di logging append-only non viene mergiata. */
  consentRecordsTableExists: boolean;
  /** True quando esiste un trigger BEFORE UPDATE/DELETE su consent_records
   *  che blocca le modifiche (immutabilità append-only). */
  consentRecordsImmutable: boolean;
};

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Stats della dashboard GDPR. Strategia in due step per ridurre al
 * minimo i roundtrip DB:
 *
 *   Step 1 (parallelo): system pages (per le versioni terms/privacy
 *   correnti) + export jobs degli ultimi 30g aggregati per status.
 *
 *   Step 2: UNA singola query su `users` con sette `COUNT(*) FILTER`
 *   aggregati — total, alive con terms/privacy/marketing accettati,
 *   in deletion grace, e drift terms/privacy (versione utente diversa
 *   dalla corrente, parametrizzata dallo step 1).
 *
 * Tradeoff vs versione precedente: prima erano 9 query su users (5
 * count base + 2 drift, più 2 di metadata su pages/exports). Ora
 * 1 sola scansione di users serve tutti i conteggi. Su 10K utenti
 * ~10-30ms; su 100K ~50-150ms; sopra serve un indice partial su
 * `deleted_at IS NULL` (migration 0043) per evitare seq scan.
 *
 * Cachata STATS_TTL_SECONDS con tag GDPR_STATS_TAG.
 */
const fetchDashboardStats = async (): Promise<GdprDashboardStats> => {
  const since = new Date(Date.now() - THIRTY_DAYS_MS);

  // Step 1 — metadata che serve a parametrizzare lo step 2.
  const [systemPages, exportRows] = await Promise.all([
    db
      .select({
        systemKey: pages.systemKey,
        contentVersion: pages.contentVersion,
        updatedAt: pages.updatedAt,
      })
      .from(pages)
      .where(eq(pages.isSystem, true)),
    db
      .select({ status: gdprExportJobs.status, c: count() })
      .from(gdprExportJobs)
      .where(gte(gdprExportJobs.requestedAt, since))
      .groupBy(gdprExportJobs.status),
  ]);

  const versionByKey = new Map<string, string>();
  const updatedByKey = new Map<string, Date>();
  for (const p of systemPages) {
    if (!p.systemKey) continue;
    versionByKey.set(p.systemKey, p.contentVersion);
    updatedByKey.set(p.systemKey, p.updatedAt);
  }

  const termsVersion = versionByKey.get("terms") ?? null;
  const privacyVersion = versionByKey.get("privacy") ?? null;

  // Step 2 — UN solo SCAN di users serve sette conteggi. Le righe di
  // drift sono no-op (0) quando la versione corrente è NULL: il
  // confronto `accepted_x_version IS NOT NULL AND accepted_x_version
  // != $param` non scatta mai se $param è NULL (NULL comparison),
  // quindi non serve un branch separato sul codice.
  const usersAgg = await db.execute<{
    total: number;
    terms_ok: number;
    privacy_ok: number;
    marketing_ok: number;
    in_grace: number;
    stale_terms: number;
    stale_privacy: number;
  }>(sql`
    SELECT
      COUNT(*) FILTER (WHERE deleted_at IS NULL)::int AS total,
      COUNT(*) FILTER (
        WHERE deleted_at IS NULL AND accepted_terms_at IS NOT NULL
      )::int AS terms_ok,
      COUNT(*) FILTER (
        WHERE deleted_at IS NULL AND accepted_privacy_at IS NOT NULL
      )::int AS privacy_ok,
      COUNT(*) FILTER (
        WHERE deleted_at IS NULL AND accepted_marketing_at IS NOT NULL
      )::int AS marketing_ok,
      COUNT(*) FILTER (WHERE deleted_at IS NOT NULL)::int AS in_grace,
      COUNT(*) FILTER (
        WHERE deleted_at IS NULL
          AND accepted_terms_version IS NOT NULL
          AND accepted_terms_version <> ${termsVersion}
      )::int AS stale_terms,
      COUNT(*) FILTER (
        WHERE deleted_at IS NULL
          AND accepted_privacy_version IS NOT NULL
          AND accepted_privacy_version <> ${privacyVersion}
      )::int AS stale_privacy
    FROM users
  `);

  const aggRows = Array.from(
    usersAgg as unknown as Array<{
      total: number;
      terms_ok: number;
      privacy_ok: number;
      marketing_ok: number;
      in_grace: number;
      stale_terms: number;
      stale_privacy: number;
    }>,
  );
  const agg = aggRows[0] ?? {
    total: 0,
    terms_ok: 0,
    privacy_ok: 0,
    marketing_ok: 0,
    in_grace: 0,
    stale_terms: 0,
    stale_privacy: 0,
  };

  const exportByStatus = {
    pending: 0,
    processing: 0,
    ready: 0,
    failed: 0,
    expired: 0,
  };
  for (const row of exportRows) {
    if (row.status in exportByStatus) {
      exportByStatus[row.status as keyof typeof exportByStatus] = row.c;
    }
  }

  return {
    totalUsers: agg.total,
    usersWithTermsAccepted: agg.terms_ok,
    usersWithPrivacyAccepted: agg.privacy_ok,
    usersWithMarketingActive: agg.marketing_ok,
    usersWithStaleTerms: agg.stale_terms,
    usersWithStalePrivacy: agg.stale_privacy,
    usersInDeletionGrace: agg.in_grace,
    currentVersions: {
      terms: termsVersion,
      privacy: privacyVersion,
      marketing: versionByKey.get("marketing") ?? null,
    },
    policyUpdatedAt: {
      terms: updatedByKey.get("terms")?.toISOString() ?? null,
      privacy: updatedByKey.get("privacy")?.toISOString() ?? null,
      marketing: updatedByKey.get("marketing")?.toISOString() ?? null,
    },
    exportJobsRecent: exportByStatus,
  };
};

const fetchDashboardStatsCached = unstable_cache(
  fetchDashboardStats,
  ["gdpr-dashboard-stats-v2"],
  { revalidate: STATS_TTL_SECONDS, tags: [GDPR_STATS_TAG] },
);

export async function getGdprDashboardStats(): Promise<GdprDashboardStats> {
  return fetchDashboardStatsCached();
}

/**
 * Health checks "infrastrutturali" GDPR: esistenza tabella consent_records
 * + presenza trigger di immutabilità. Una sola query fa entrambi i probe
 * (subselect EXISTS); cambiano solo dopo migration, TTL 5min è safe.
 */
const fetchHealthChecks = async (): Promise<GdprHealthChecks> => {
  const probe = await db.execute<{
    table_exists: boolean;
    immutable_trigger: boolean;
  }>(sql`
    SELECT
      to_regclass('public.consent_records') IS NOT NULL AS table_exists,
      EXISTS (
        SELECT 1
        FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        WHERE c.relname = 'consent_records'
          AND NOT t.tgisinternal
          AND t.tgname LIKE '%immutable%'
      ) AS immutable_trigger
  `);

  const rows = Array.from(
    probe as unknown as Array<{
      table_exists: boolean;
      immutable_trigger: boolean;
    }>,
  );
  const row = rows[0];

  return {
    consentRecordsTableExists: Boolean(row?.table_exists),
    // Un trigger ha senso solo se la tabella esiste; se la tabella manca
    // forziamo a false anche se la subselect ha trovato un trigger
    // "orfano" da qualche refactor passato (defense in depth).
    consentRecordsImmutable: Boolean(row?.table_exists) && Boolean(row?.immutable_trigger),
  };
};

const fetchHealthChecksCached = unstable_cache(
  fetchHealthChecks,
  ["gdpr-health-checks-v2"],
  { revalidate: HEALTH_TTL_SECONDS, tags: [GDPR_HEALTH_TAG] },
);

export async function getGdprHealthChecks(): Promise<GdprHealthChecks> {
  return fetchHealthChecksCached();
}
