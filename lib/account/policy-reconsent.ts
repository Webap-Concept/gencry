import "server-only";

import { db } from "@/lib/db/drizzle";
import { getConsentSnapshots } from "@/lib/db/pages-queries";
import {
  policyChangeNotifications,
  users,
  type PolicyNotificationKey,
} from "@/lib/db/schema";
import { getAppSettings } from "@/lib/db/settings-queries";
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { recordConsent } from "./consent-ledger";

// ---------------------------------------------------------------------------
// Enqueue (chiamato da upsertPage al bump di una pagina di sistema)
// ---------------------------------------------------------------------------

const POLICY_TO_USER_VERSION_COL = {
  terms: "accepted_terms_version",
  privacy: "accepted_privacy_version",
  marketing: "accepted_marketing_version",
} as const;

const POLICY_TO_USER_AT_COL = {
  terms: "accepted_terms_at",
  privacy: "accepted_privacy_at",
  marketing: "accepted_marketing_at",
} as const;

/**
 * Crea righe `pending` in policy_change_notifications per tutti gli utenti
 * con versione obsoleta della policy specificata.
 *
 * - terms / privacy: tutti gli utenti con accepted_*_version != newVersion
 *   AND accepted_*_version IS NOT NULL (gli utenti senza versione accettata
 *   non vengono "forzati" retroattivamente — UX scelta in PR plan).
 * - marketing: in più richiede accepted_marketing_at IS NOT NULL (opt-in
 *   ancora attivo). Se l'utente ha revocato, niente notifica.
 *
 * No-op se gdpr.policy.force_reconsent_on_change non è 'true'. Best-effort:
 * errori loggati ma non rilanciati per non bloccare il save della pagina.
 *
 * Usa SQL grezzo invece di Drizzle insert-from-select perché Drizzle non
 * espone bene quel pattern e qui ci interessa: niente N+1, una sola query.
 */
export async function enqueuePolicyChangeNotifications(
  policyKey: PolicyNotificationKey,
  newVersion: string,
): Promise<void> {
  let settings;
  try {
    settings = await getAppSettings();
  } catch (err) {
    console.error("[policy-reconsent] failed to read settings:", err);
    return;
  }
  if (settings["gdpr.policy.force_reconsent_on_change"] !== "true") return;

  const versionCol = POLICY_TO_USER_VERSION_COL[policyKey];
  const atCol = POLICY_TO_USER_AT_COL[policyKey];

  try {
    if (policyKey === "marketing") {
      await db.execute(sql`
        INSERT INTO policy_change_notifications
          (user_id, policy_key, policy_version, status, created_at)
        SELECT id, ${policyKey}, ${newVersion}, 'pending', NOW()
        FROM users
        WHERE deleted_at IS NULL
          AND ${sql.identifier(atCol)} IS NOT NULL
          AND ${sql.identifier(versionCol)} IS NOT NULL
          AND ${sql.identifier(versionCol)} <> ${newVersion}
        ON CONFLICT (user_id, policy_key, policy_version) DO NOTHING
      `);
    } else {
      await db.execute(sql`
        INSERT INTO policy_change_notifications
          (user_id, policy_key, policy_version, status, created_at)
        SELECT id, ${policyKey}, ${newVersion}, 'pending', NOW()
        FROM users
        WHERE deleted_at IS NULL
          AND ${sql.identifier(versionCol)} IS NOT NULL
          AND ${sql.identifier(versionCol)} <> ${newVersion}
        ON CONFLICT (user_id, policy_key, policy_version) DO NOTHING
      `);
    }
  } catch (err) {
    console.error(
      `[policy-reconsent] enqueue failed for ${policyKey}@${newVersion}:`,
      err,
    );
  }
}

// ---------------------------------------------------------------------------
// Frontend query (renderizzata in /(protected)/layout)
// ---------------------------------------------------------------------------

export type PendingReconsent = {
  policyKey: PolicyNotificationKey;
  /** Versione corrente della policy. */
  newVersion: string;
  /** Testo della policy attuale (HTML, da sanificare lato client). */
  newText: string;
  /** Versione che l'utente aveva accettato in passato. */
  acceptedVersion: string;
  /** Quando è stata enqueata la più vecchia notifica per questa policy. */
  enqueuedAt: Date;
};

export type PendingReconsentsResult = {
  items: PendingReconsent[];
  /** Created_at minima fra tutte le righe → guida la transizione
   *  banner → bloccante. */
  oldestEnqueuedAt: Date | null;
  /** Da settings, in ms. */
  graceMs: number;
};

/**
 * Cosa deve riaccettare l'utente.
 *
 * Strategia:
 *   1. carico la versione corrente di terms/privacy/marketing (snapshot)
 *   2. confronto con users.accepted_*_version
 *   3. mostro solo le policy con riga in `policy_change_notifications`
 *      (di QUALSIASI status — l'email è solo un side-channel; quel che
 *      conta per la UI è che l'admin ha attivato la riconsensa)
 *
 * Filtro per `policy_change_notifications`: protegge il caso "feature
 * appena attivata su utenti pre-versioning" — finché upsertPage non bumpa
 * davvero la policy, nessuna riga viene creata e nessun utente vede il
 * banner anche se ha versione "vecchia".
 *
 * Se `gdpr.policy.force_reconsent_on_change` è OFF, ritorna sempre vuoto.
 */
export async function getPendingReconsents(
  userId: string,
): Promise<PendingReconsentsResult> {
  const settings = await getAppSettings();
  const empty: PendingReconsentsResult = {
    items: [],
    oldestEnqueuedAt: null,
    graceMs: parseGraceMs(settings["gdpr.policy.reconsent_grace_days"]),
  };
  if (settings["gdpr.policy.force_reconsent_on_change"] !== "true") {
    return empty;
  }

  const [user] = await db
    .select({
      acceptedTermsVersion: users.acceptedTermsVersion,
      acceptedPrivacyVersion: users.acceptedPrivacyVersion,
      acceptedMarketingVersion: users.acceptedMarketingVersion,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) return empty;

  const snapshots = await getConsentSnapshots();

  // Quali policy possono potenzialmente richiedere riaccettazione (quelle
  // dove l'utente ha una versione accettata diversa da quella corrente).
  const candidates: Array<{
    policyKey: PolicyNotificationKey;
    newVersion: string;
    newText: string;
    acceptedVersion: string;
  }> = [];

  if (
    snapshots.terms &&
    user.acceptedTermsVersion &&
    user.acceptedTermsVersion !== snapshots.terms.version
  ) {
    candidates.push({
      policyKey: "terms",
      newVersion: snapshots.terms.version,
      newText: snapshots.terms.text,
      acceptedVersion: user.acceptedTermsVersion,
    });
  }
  if (
    snapshots.privacy &&
    user.acceptedPrivacyVersion &&
    user.acceptedPrivacyVersion !== snapshots.privacy.version
  ) {
    candidates.push({
      policyKey: "privacy",
      newVersion: snapshots.privacy.version,
      newText: snapshots.privacy.text,
      acceptedVersion: user.acceptedPrivacyVersion,
    });
  }
  if (
    snapshots.marketing &&
    user.acceptedMarketingVersion &&
    user.acceptedMarketingVersion !== snapshots.marketing.version
  ) {
    candidates.push({
      policyKey: "marketing",
      newVersion: snapshots.marketing.version,
      newText: snapshots.marketing.text,
      acceptedVersion: user.acceptedMarketingVersion,
    });
  }

  if (candidates.length === 0) return empty;

  // Solo le policy che hanno ANCHE una riga nella job table (qualsiasi
  // status) vengono mostrate: questo previene il caso "utente con versione
  // vecchia ma admin non ha mai attivato force_reconsent" → niente banner
  // a sorpresa.
  const candidateKeys = candidates.map((c) => c.policyKey);
  const candidateVersions = candidates.map((c) => c.newVersion);
  const enqueuedRows = await db
    .select({
      policyKey: policyChangeNotifications.policyKey,
      policyVersion: policyChangeNotifications.policyVersion,
      createdAt: policyChangeNotifications.createdAt,
    })
    .from(policyChangeNotifications)
    .where(
      and(
        eq(policyChangeNotifications.userId, userId),
        inArray(policyChangeNotifications.policyKey, candidateKeys),
        inArray(policyChangeNotifications.policyVersion, candidateVersions),
      ),
    );

  const enqueuedByKeyVersion = new Map<string, Date>();
  for (const r of enqueuedRows) {
    enqueuedByKeyVersion.set(`${r.policyKey}:${r.policyVersion}`, r.createdAt);
  }

  const items: PendingReconsent[] = [];
  let oldest: Date | null = null;
  for (const c of candidates) {
    const key = `${c.policyKey}:${c.newVersion}`;
    const enqueuedAt = enqueuedByKeyVersion.get(key);
    if (!enqueuedAt) continue;
    items.push({ ...c, enqueuedAt });
    if (oldest === null || enqueuedAt < oldest) oldest = enqueuedAt;
  }

  return {
    items,
    oldestEnqueuedAt: oldest,
    graceMs: parseGraceMs(settings["gdpr.policy.reconsent_grace_days"]),
  };
}

function parseGraceMs(raw: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 14 * 24 * 60 * 60 * 1000;
  return Math.trunc(n) * 24 * 60 * 60 * 1000;
}

// ---------------------------------------------------------------------------
// Accept (chiamato dal banner client → server action)
// ---------------------------------------------------------------------------

export type AcceptUpdatedConsentsInput = {
  userId: string;
  ip: string | null;
  userAgent: string | null;
  locale: string | null;
  /** Quali policy l'utente ha appena (ri)accettato in questo round. */
  accept: {
    terms?: boolean;
    privacy?: boolean;
    marketing?: boolean;
  };
};

/**
 * Persiste l'accettazione delle nuove versioni:
 *   - UPDATE users.accepted_*_at / accepted_*_version per ogni policy in `accept`
 *   - INSERT consent_records con source='policy_reconsent' per ognuna
 *   - DELETE righe pending in policy_change_notifications per quelle policy
 *     (qualunque versione precedente — risolto ad oggi)
 *
 * Marketing skippato (assenza dal payload) NON modifica niente — la riga
 * pending resta, il banner riapparirà al prossimo refresh.
 */
export async function acceptUpdatedConsents(
  input: AcceptUpdatedConsentsInput,
): Promise<void> {
  const snapshots = await getConsentSnapshots();
  const now = new Date();

  const updates: Partial<{
    acceptedTermsAt: Date;
    acceptedTermsVersion: string;
    acceptedPrivacyAt: Date;
    acceptedPrivacyVersion: string;
    acceptedMarketingAt: Date;
    acceptedMarketingVersion: string;
    updatedAt: Date;
  }> = { updatedAt: now };

  const acceptedKeys: PolicyNotificationKey[] = [];

  if (input.accept.terms && snapshots.terms) {
    updates.acceptedTermsAt = now;
    updates.acceptedTermsVersion = snapshots.terms.version;
    acceptedKeys.push("terms");
  }
  if (input.accept.privacy && snapshots.privacy) {
    updates.acceptedPrivacyAt = now;
    updates.acceptedPrivacyVersion = snapshots.privacy.version;
    acceptedKeys.push("privacy");
  }
  if (input.accept.marketing && snapshots.marketing) {
    updates.acceptedMarketingAt = now;
    updates.acceptedMarketingVersion = snapshots.marketing.version;
    acceptedKeys.push("marketing");
  }

  if (acceptedKeys.length === 0) return;

  await db.update(users).set(updates).where(eq(users.id, input.userId));

  // Ledger: una riga per ogni policy accettata. Best-effort interno.
  await Promise.all(
    acceptedKeys.map((k) => {
      const snap = snapshots[k]!;
      return recordConsent({
        userId: input.userId,
        consentType: k,
        action: "granted",
        policyVersion: snap.version,
        policyText: snap.text,
        ip: input.ip,
        userAgent: input.userAgent,
        locale: input.locale,
        source: "policy_reconsent",
      });
    }),
  );

  // Pulizia job: chiudo le pending per quelle policy (qualsiasi versione
  // — anche eventuali code "stale"). Best-effort.
  try {
    await db
      .delete(policyChangeNotifications)
      .where(
        and(
          eq(policyChangeNotifications.userId, input.userId),
          inArray(policyChangeNotifications.policyKey, acceptedKeys),
        ),
      );
  } catch (err) {
    console.error(
      "[policy-reconsent] failed to clear notifications after accept:",
      err,
    );
  }
}

// ---------------------------------------------------------------------------
// Cron worker — usato da /api/cron/policy-change-notifications
// ---------------------------------------------------------------------------

const CRON_BATCH_USERS = 50;
const MAX_ATTEMPTS = 3;

export type CronRunResult = {
  processed: number;
  sent: number;
  failed: number;
};

/**
 * Process del batch:
 *   1. seleziona fino a CRON_BATCH_USERS utenti con almeno una pending
 *      e attempt_count < MAX_ATTEMPTS
 *   2. per ognuno, raggruppa le pending → invia 1 mail
 *   3. marca `sent` su success, `failed` (con error) su exception
 *      e attempt_count++ in entrambi i casi
 *
 * Il consumer fa l'import dinamico di `sendPolicyUpdateNotificationEmail`
 * per evitare cicli (template → settings → consent-ledger → ...).
 */
export async function runPolicyChangeNotificationsCron(): Promise<CronRunResult> {
  const settings = await getAppSettings();
  if (settings["gdpr.policy.force_reconsent_on_change"] !== "true") {
    return { processed: 0, sent: 0, failed: 0 };
  }

  // Utenti distinti con righe pending entro retry budget.
  const userIdsRows = await db
    .selectDistinct({ userId: policyChangeNotifications.userId })
    .from(policyChangeNotifications)
    .where(
      and(
        eq(policyChangeNotifications.status, "pending"),
        lt(policyChangeNotifications.attemptCount, MAX_ATTEMPTS),
      ),
    )
    .limit(CRON_BATCH_USERS);

  if (userIdsRows.length === 0) {
    return { processed: 0, sent: 0, failed: 0 };
  }

  // Lazy import per evitare cicli col modulo email.
  const { sendPolicyUpdateNotificationEmail } = await import(
    "@/lib/email/templates/policy-update-notification"
  );

  let sent = 0;
  let failed = 0;

  for (const { userId } of userIdsRows) {
    // Carica le pending dell'utente + email/firstName.
    const pendingRows = await db
      .select({
        id: policyChangeNotifications.id,
        policyKey: policyChangeNotifications.policyKey,
        policyVersion: policyChangeNotifications.policyVersion,
      })
      .from(policyChangeNotifications)
      .where(
        and(
          eq(policyChangeNotifications.userId, userId),
          eq(policyChangeNotifications.status, "pending"),
        ),
      );
    if (pendingRows.length === 0) continue;

    const [u] = await db
      .select({
        email: users.email,
        deletedAt: users.deletedAt,
        locale: users.locale,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!u || u.deletedAt) {
      // Utente cancellato: marca skipped per tutte le pending dell'utente.
      await db
        .update(policyChangeNotifications)
        .set({ status: "skipped", sentAt: new Date() })
        .where(
          inArray(
            policyChangeNotifications.id,
            pendingRows.map((p) => p.id),
          ),
        );
      continue;
    }

    const ids = pendingRows.map((p) => p.id);
    const policyKeys = Array.from(new Set(pendingRows.map((p) => p.policyKey)));

    try {
      const { isLocale, DEFAULT_LOCALE } = await import("@/lib/i18n/config");
      const locale = isLocale(u.locale) ? u.locale : DEFAULT_LOCALE;
      await sendPolicyUpdateNotificationEmail({
        toEmail: u.email,
        policyKeys,
        locale,
      });
      await db
        .update(policyChangeNotifications)
        .set({
          status: "sent",
          sentAt: new Date(),
          attemptCount: sql`${policyChangeNotifications.attemptCount} + 1`,
        })
        .where(inArray(policyChangeNotifications.id, ids));
      sent += pendingRows.length;
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown";
      await db
        .update(policyChangeNotifications)
        .set({
          status: sql`CASE WHEN ${policyChangeNotifications.attemptCount} + 1 >= ${MAX_ATTEMPTS} THEN 'failed' ELSE 'pending' END`,
          attemptCount: sql`${policyChangeNotifications.attemptCount} + 1`,
          error: message.slice(0, 500),
        })
        .where(inArray(policyChangeNotifications.id, ids));
      failed += pendingRows.length;
    }
  }

  return { processed: userIdsRows.length, sent, failed };
}
