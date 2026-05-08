import "server-only";

import { db } from "@/lib/db/drizzle";
import { gdprExportJobs, pages, users } from "@/lib/db/schema";
import { and, count, eq, gte, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";

/** Tag per `revalidateTag()` quando si vuole forzare il ricalcolo delle
 * stats GDPR (es. dopo bump versione policy o creazione consent_records).
 * Senza revalidate la cache scade comunque ogni 60s. */
export const GDPR_STATS_TAG = "gdpr-dashboard-stats";
export const GDPR_HEALTH_TAG = "gdpr-health-checks";

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
  policyUpdatedAt: {
    terms: Date | null;
    privacy: Date | null;
    marketing: Date | null;
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
 * Stats della dashboard GDPR: 7 query parallele su users/pages/gdprExportJobs
 * + 2 di follow-up (drift terms/privacy). Cachata 60s con tag GDPR_STATS_TAG
 * per evitare di ri-eseguire l'intero fan-out a ogni navigazione admin.
 *
 * Stale tolerance: le stats di adoption policy non cambiano realtime; 60s
 * è ampiamente accettabile. Per forzare refresh dopo un bump di versione
 * pagina (terms/privacy) o un purge admin, chiamare
 * `revalidateTag(GDPR_STATS_TAG)`.
 */
const fetchDashboardStats = async (): Promise<GdprDashboardStats> => {
  const since = new Date(Date.now() - THIRTY_DAYS_MS);

  const [
    totalRow,
    termsAcceptedRow,
    privacyAcceptedRow,
    marketingActiveRow,
    inGraceRow,
    systemPages,
    exportRows,
  ] = await Promise.all([
    db.select({ c: count() }).from(users).where(isNull(users.deletedAt)),
    db
      .select({ c: count() })
      .from(users)
      .where(and(isNull(users.deletedAt), isNotNull(users.acceptedTermsAt))),
    db
      .select({ c: count() })
      .from(users)
      .where(and(isNull(users.deletedAt), isNotNull(users.acceptedPrivacyAt))),
    db
      .select({ c: count() })
      .from(users)
      .where(and(isNull(users.deletedAt), isNotNull(users.acceptedMarketingAt))),
    db.select({ c: count() }).from(users).where(isNotNull(users.deletedAt)),
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

  // Drift: utenti con versione accettata diversa da quella corrente.
  const [staleTermsRow, stalePrivacyRow] = await Promise.all([
    termsVersion
      ? db
          .select({ c: count() })
          .from(users)
          .where(
            and(
              isNull(users.deletedAt),
              isNotNull(users.acceptedTermsVersion),
              ne(users.acceptedTermsVersion, termsVersion),
            ),
          )
      : Promise.resolve([{ c: 0 }]),
    privacyVersion
      ? db
          .select({ c: count() })
          .from(users)
          .where(
            and(
              isNull(users.deletedAt),
              isNotNull(users.acceptedPrivacyVersion),
              ne(users.acceptedPrivacyVersion, privacyVersion),
            ),
          )
      : Promise.resolve([{ c: 0 }]),
  ]);

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
    totalUsers: totalRow[0]?.c ?? 0,
    usersWithTermsAccepted: termsAcceptedRow[0]?.c ?? 0,
    usersWithPrivacyAccepted: privacyAcceptedRow[0]?.c ?? 0,
    usersWithMarketingActive: marketingActiveRow[0]?.c ?? 0,
    usersWithStaleTerms: staleTermsRow[0]?.c ?? 0,
    usersWithStalePrivacy: stalePrivacyRow[0]?.c ?? 0,
    usersInDeletionGrace: inGraceRow[0]?.c ?? 0,
    currentVersions: {
      terms: termsVersion,
      privacy: privacyVersion,
      marketing: versionByKey.get("marketing") ?? null,
    },
    policyUpdatedAt: {
      terms: updatedByKey.get("terms") ?? null,
      privacy: updatedByKey.get("privacy") ?? null,
      marketing: updatedByKey.get("marketing") ?? null,
    },
    exportJobsRecent: exportByStatus,
  };
};

const fetchDashboardStatsCached = unstable_cache(
  fetchDashboardStats,
  ["gdpr-dashboard-stats"],
  { revalidate: 60, tags: [GDPR_STATS_TAG] },
);

export async function getGdprDashboardStats(): Promise<GdprDashboardStats> {
  return fetchDashboardStatsCached();
}

/**
 * Health checks "infrastrutturali" GDPR: esistenza tabella consent_records
 * + presenza trigger di immutabilità. Cambiano solo dopo migration → cache
 * 60s è abbondantemente safe (al limite l'admin aspetta 1 min per vedere
 * il risultato di una migration appena eseguita).
 */
const fetchHealthChecks = async (): Promise<GdprHealthChecks> => {
  // Probe esistenza tabella `consent_records` senza assumere lo schema:
  // to_regclass ritorna oid se esiste, NULL altrimenti.
  const tableExistsRows = await db.execute<{ exists: boolean }>(
    sql`SELECT to_regclass('public.consent_records') IS NOT NULL AS exists`,
  );
  const tableRows = tableExistsRows as unknown as Array<{ exists: boolean }>;
  const consentRecordsTableExists = Boolean(tableRows[0]?.exists);

  let consentRecordsImmutable = false;
  if (consentRecordsTableExists) {
    const triggerRows = await db.execute<{ exists: boolean }>(
      sql`SELECT EXISTS (
        SELECT 1 FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        WHERE c.relname = 'consent_records'
          AND NOT t.tgisinternal
          AND t.tgname LIKE '%immutable%'
      ) AS exists`,
    );
    const trgRows = triggerRows as unknown as Array<{ exists: boolean }>;
    consentRecordsImmutable = Boolean(trgRows[0]?.exists);
  }

  return {
    consentRecordsTableExists,
    consentRecordsImmutable,
  };
};

const fetchHealthChecksCached = unstable_cache(
  fetchHealthChecks,
  ["gdpr-health-checks"],
  { revalidate: 60, tags: [GDPR_HEALTH_TAG] },
);

export async function getGdprHealthChecks(): Promise<GdprHealthChecks> {
  return fetchHealthChecksCached();
}
