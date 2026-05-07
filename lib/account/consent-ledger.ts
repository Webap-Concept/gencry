import "server-only";

import { db } from "@/lib/db/drizzle";
import { getConsentSnapshots } from "@/lib/db/pages-queries";
import { consentRecords } from "@/lib/db/schema";
import type {
  ConsentAction,
  ConsentIpStrategy,
  ConsentType,
} from "@/lib/db/schema";
import { getAppSettings } from "@/lib/db/settings-queries";
import { sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { applyConsentLogPolicy } from "./consent-ledger-pure";

export type ConsentSource =
  | "signup"
  | "oauth_signup"
  | "staff_invite"
  | "settings_toggle"
  | "policy_reconsent"
  | "cookie_banner"
  | "admin"
  | "backfill";

export type RecordConsentInput = {
  /** null per consensi anonimi (es. cookie banner pre-signup). */
  userId: string | null;
  consentType: ConsentType;
  action: ConsentAction;
  /** Versione policy mostrata. Null per cookie_*. */
  policyVersion?: string | null;
  /** Testo policy mostrato — usato per calcolare policy_text_hash quando
   *  hash_policy_text è abilitato. Non viene mai persistito in chiaro. */
  policyText?: string | null;
  /** IP del client (header x-forwarded-for / req.ip).
   *  L'helper applica la strategy configurata prima di salvare. */
  ip?: string | null;
  userAgent?: string | null;
  locale?: string | null;
  /** Origine dell'evento, salvata in metadata.source. Aiuta a distinguere
   *  signup vs toggle vs banner vs backfill. */
  source: ConsentSource;
  /** Bag aggiuntivo di metadati (cookie categories, ecc.). */
  extraMetadata?: Record<string, unknown>;
};

/**
 * Scrive un evento di consenso sull'append-only ledger `consent_records`.
 *
 * Best-effort: se la tabella non esiste ancora (migration non applicata)
 * o se il consent log è disabilitato dalle settings, ritorna senza fare
 * niente. Errori di INSERT vengono loggati ma NON rilanciati — non vogliamo
 * mai che un guasto del ledger blocchi il flusso utente (signup, login,
 * toggle marketing).
 *
 * Per la motivazione di design, vedi lib/db/migrations/0026_consent_records.sql.
 */
export async function recordConsent(input: RecordConsentInput): Promise<void> {
  let settings;
  try {
    settings = await getAppSettings();
  } catch (err) {
    console.error("[consent-ledger] failed to read settings:", err);
    return;
  }

  if (settings["gdpr.consent_log.enabled"] !== "true") return;

  const captureIp = settings["gdpr.consent_log.capture_ip"] === "true";
  const captureUa = settings["gdpr.consent_log.capture_user_agent"] === "true";
  const hashPolicy = settings["gdpr.consent_log.hash_policy_text"] === "true";
  const ipStrategy = settings[
    "gdpr.consent_log.ip_strategy"
  ] as ConsentIpStrategy;

  const policy = applyConsentLogPolicy({
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
    policyText: input.policyText ?? null,
    captureIp,
    captureUa,
    hashPolicy,
    ipStrategy,
    hashFn: sha256Hex,
  });

  const metadata: Record<string, unknown> = {
    source: input.source,
    ...input.extraMetadata,
  };

  try {
    await db.insert(consentRecords).values({
      userId: input.userId,
      consentType: input.consentType,
      action: input.action,
      policyVersion: input.policyVersion ?? null,
      policyTextHash: policy.policyTextHash,
      ip: policy.ip,
      ipStrategy: policy.appliedStrategy,
      userAgent: policy.userAgent,
      locale: input.locale ?? null,
      metadata,
    });
  } catch (err) {
    // Tipici fallimenti silenziabili:
    //   - tabella inesistente (migration non applicata) → 42P01
    //   - violazione check constraint (consent_type/action non riconosciuto)
    //   - DB momentaneamente irraggiungibile
    // Logghiamo per essere visibili in monitoraggio ma NON rilanciamo: il
    // chiamante (signup, toggle marketing) deve poter completare comunque.
    console.error("[consent-ledger] insert failed:", err);
  }
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

// ---------------------------------------------------------------------------
// Signup helper
// ---------------------------------------------------------------------------

export type SignupConsentsInput = {
  userId: string;
  /** True sse l'utente ha spuntato il checkbox marketing al signup.
   *  Se false, non logghiamo NIENTE per il marketing (silenzio = non
   *  consenso, conforme al principio "consenso esplicito" GDPR). */
  acceptMarketing: boolean;
  ip: string | null;
  userAgent: string | null;
  locale: string | null;
  /** Default 'signup' — usa 'oauth_signup' o 'staff_invite' per distinguere. */
  source?: "signup" | "oauth_signup" | "staff_invite";
};

/**
 * Wrapper convenience per i flussi di registrazione: carica lo snapshot
 * delle policy una sola volta e scrive i `consent_records` per
 * terms / privacy (sempre obbligatori) + marketing (solo se accettato).
 *
 * Best-effort: i singoli `recordConsent` interni catturano i propri errori,
 * questa funzione non rilancia mai. Se lo snapshot non si carica, ritorna
 * subito senza scrivere — meglio nessun record che record incompleti.
 */
export async function recordSignupConsents(
  input: SignupConsentsInput,
): Promise<void> {
  const source = input.source ?? "signup";

  let snapshots;
  try {
    snapshots = await getConsentSnapshots();
  } catch (err) {
    console.error("[consent-ledger] failed to load policy snapshots:", err);
    return;
  }

  const tasks: Array<Promise<void>> = [];

  if (snapshots.terms) {
    tasks.push(
      recordConsent({
        userId: input.userId,
        consentType: "terms",
        action: "granted",
        policyVersion: snapshots.terms.version,
        policyText: snapshots.terms.text,
        ip: input.ip,
        userAgent: input.userAgent,
        locale: input.locale,
        source,
      }),
    );
  }

  if (snapshots.privacy) {
    tasks.push(
      recordConsent({
        userId: input.userId,
        consentType: "privacy",
        action: "granted",
        policyVersion: snapshots.privacy.version,
        policyText: snapshots.privacy.text,
        ip: input.ip,
        userAgent: input.userAgent,
        locale: input.locale,
        source,
      }),
    );
  }

  if (input.acceptMarketing && snapshots.marketing) {
    tasks.push(
      recordConsent({
        userId: input.userId,
        consentType: "marketing",
        action: "granted",
        policyVersion: snapshots.marketing.version,
        policyText: snapshots.marketing.text,
        ip: input.ip,
        userAgent: input.userAgent,
        locale: input.locale,
        source,
      }),
    );
  }

  await Promise.all(tasks);
}

// ---------------------------------------------------------------------------
// Marketing toggle helper
// ---------------------------------------------------------------------------

export type MarketingConsentChangeInput = {
  userId: string;
  action: "granted" | "revoked";
  ip: string | null;
  userAgent: string | null;
  locale: string | null;
};

/**
 * Registra un evento di toggle del consenso marketing nel ledger.
 *
 * Carica la versione + il testo della pagina di sistema "marketing" così
 * il record contiene `policy_version` e (se hash_policy_text è abilitato)
 * `policy_text_hash`. Per le revoke registriamo comunque la versione
 * corrente — è la versione che era in vigore al momento della revoca,
 * utile per ricostruire la timeline (la versione effettivamente
 * accettata in passato resta tracciata dal record "granted" precedente).
 *
 * Best-effort: errori interni non rilanciati. Non sostituisce l'UPDATE su
 * `users.acceptedMarketing*` (resta in setMarketingConsent per retro-
 * compatibilità con la UI di /settings/privacy che legge da lì).
 */
export async function recordMarketingConsentChange(
  input: MarketingConsentChangeInput,
): Promise<void> {
  let snapshots;
  try {
    snapshots = await getConsentSnapshots();
  } catch (err) {
    console.error("[consent-ledger] failed to load policy snapshots:", err);
    return;
  }

  if (!snapshots.marketing) return;

  await recordConsent({
    userId: input.userId,
    consentType: "marketing",
    action: input.action,
    policyVersion: snapshots.marketing.version,
    policyText: snapshots.marketing.text,
    ip: input.ip,
    userAgent: input.userAgent,
    locale: input.locale,
    source: "settings_toggle",
  });
}

// ---------------------------------------------------------------------------
// Cookie banner helper
// ---------------------------------------------------------------------------

export type CookieConsentChoice = {
  preferences: boolean;
  analytics: boolean;
  marketing: boolean;
};

export type CookieConsentInput = {
  /** Null per visitatori non autenticati (caso più comune del banner). */
  userId: string | null;
  choice: CookieConsentChoice;
  ip: string | null;
  userAgent: string | null;
  locale: string | null;
  /** "accept_all" | "reject_all" | "custom" — finisce in metadata.variant. */
  variant: "accept_all" | "reject_all" | "custom";
};

/**
 * Registra le 4 categorie di cookie sul ledger come eventi separati.
 *
 * `cookie_necessary` viene sempre loggato come "granted": tecnicamente non
 * è opt-in (è un cookie funzionale ai sensi dell'art. 5(3) ePrivacy), ma
 * lo registriamo per completezza dell'audit trail e per documentare cosa
 * l'utente ha visto al momento del consenso.
 *
 * Le altre tre vengono loggate come "granted" o "revoked" in base alla
 * scelta. Una "revoked" iniziale è perfettamente valida e rappresenta
 * un opt-out esplicito (es. click su "Rifiuta tutti").
 *
 * `policy_version` e `policy_text` sono null perché per i cookie non
 * esiste una policy unica versionata — il consenso è sulla categoria,
 * non sul testo. La cookie policy è documentata altrove (privacy page).
 *
 * Best-effort come tutto il resto del ledger: non rilancia mai.
 */
export async function recordCookieConsents(input: CookieConsentInput): Promise<void> {
  const baseMetadata = { variant: input.variant };
  const tasks: Array<Promise<void>> = [];

  const items: Array<{ type: ConsentType; granted: boolean }> = [
    { type: "cookie_necessary", granted: true },
    { type: "cookie_preferences", granted: input.choice.preferences },
    { type: "cookie_analytics", granted: input.choice.analytics },
    { type: "cookie_marketing", granted: input.choice.marketing },
  ];

  for (const item of items) {
    tasks.push(
      recordConsent({
        userId: input.userId,
        consentType: item.type,
        action: item.granted ? "granted" : "revoked",
        policyVersion: null,
        policyText: null,
        ip: input.ip,
        userAgent: input.userAgent,
        locale: input.locale,
        source: "cookie_banner",
        extraMetadata: baseMetadata,
      }),
    );
  }

  await Promise.all(tasks);
}

// ─── Retention cleanup ───────────────────────────────────────────────────────
//
// `consent_records` è append-only e crece monotonamente (ogni cambio cookie
// = 4 righe, ogni toggle marketing = 1, ogni signup = 2-3). Per evitare
// che la tabella diventi una bomba a tempo serve un cron di retention
// pluriennale: per legge GDPR (Art. 7(1)) basta dimostrare il consenso
// "per tutto il tempo della relazione contrattuale + un periodo successivo"
// — di solito 5 anni dopo la fine. Oltre, le righe possono essere cancellate.
//
// Il setting `gdpr.consent_log.retention_after_deletion_days` (default 1825 =
// 5 anni) controlla la max age di QUALUNQUE riga, attiva o post-cancellazione
// (irrilevante: il CASCADE pulisce già le post-cancellazione, vedi
// migration 0027). Un valore di 0 disabilita il purge.

const PURGE_BATCH_SIZE = 5000;
/** Massimo numero di batch in una singola esecuzione del cron, per evitare
 *  che un'unica chiamata blocchi indefinitamente la lock table. A regime
 *  basta 1-2 batch al mese; le esecuzioni successive recuperano l'arretrato. */
const PURGE_MAX_BATCHES = 20;

export type ConsentRetentionResult = {
  /** Cutoff effettivo applicato (ISO). null se purge disabilitato. */
  cutoffAt: string | null;
  /** Righe cancellate complessivamente in questa esecuzione. */
  deleted: number;
  /** True se abbiamo raggiunto il limite di batch e potrebbero esserci
   *  altre righe da cancellare al prossimo run. */
  hasMore: boolean;
  /** Reason di skip (se applicabile). */
  skipped?: "disabled" | "log_disabled" | "invalid_retention";
};

/**
 * Cancella in batch le righe `consent_records` più vecchie del retention
 * configurato. Idempotente: rieseguibile in sicurezza.
 *
 * Strategia:
 * - Settings.gdpr.consent_log.retention_after_deletion_days definisce N.
 * - Cutoff = now() - N giorni. N=0 disabilita il purge.
 * - DELETE in batch da PURGE_BATCH_SIZE righe usando una subquery con
 *   `ctid IN (SELECT ctid FROM consent_records WHERE created_at < $cutoff
 *   LIMIT N)` — pattern Postgres-friendly per non scansionare la tabella
 *   intera in una singola transazione e non promuovere a lock pesante.
 * - Si ferma a PURGE_MAX_BATCHES per non bloccare il cron oltre il
 *   ragionevole; il prossimo run riparte.
 *
 * Rispetta `gdpr.consent_log.enabled`: se l'admin ha disabilitato il
 * logging tutto, anche il purge si ferma (per evitare cleanup "silenzioso"
 * di un sistema che non vuole essere usato).
 */
export async function purgeStaleConsentRecords(): Promise<ConsentRetentionResult> {
  let settings;
  try {
    settings = await getAppSettings();
  } catch (err) {
    console.error("[purgeStaleConsentRecords] settings load failed:", err);
    return { cutoffAt: null, deleted: 0, hasMore: false, skipped: "disabled" };
  }

  if (settings["gdpr.consent_log.enabled"] !== "true") {
    return { cutoffAt: null, deleted: 0, hasMore: false, skipped: "log_disabled" };
  }

  const raw = settings["gdpr.consent_log.retention_after_deletion_days"];
  const retentionDays = Number.parseInt(raw ?? "0", 10);
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) {
    return {
      cutoffAt: null,
      deleted: 0,
      hasMore: false,
      skipped: retentionDays === 0 ? "disabled" : "invalid_retention",
    };
  }

  const cutoff = new Date(Date.now() - retentionDays * 86400_000);

  let totalDeleted = 0;
  let batches = 0;
  let lastBatchSize = 0;

  do {
    // DELETE FROM consent_records WHERE ctid IN
    //   (SELECT ctid FROM consent_records WHERE created_at < $cutoff
    //    ORDER BY created_at LIMIT $batchSize)
    // ctid è il puntatore fisico Postgres, l'unica via per limitare
    // un DELETE in modo efficiente senza chiavi composite.
    const result = await db.execute(sql`
      DELETE FROM consent_records
      WHERE ctid IN (
        SELECT ctid FROM consent_records
        WHERE created_at < ${cutoff}
        ORDER BY created_at
        LIMIT ${PURGE_BATCH_SIZE}
      )
    `);

    // drizzle-orm postgres-js ritorna { rowCount } sul result, ma a seconda
    // del driver (postgres-js / pg / neon) la chiave può variare. Tentiamo
    // più nomi conosciuti, default 0.
    const r = result as unknown as {
      rowCount?: number;
      count?: number;
      length?: number;
    };
    lastBatchSize = r.rowCount ?? r.count ?? r.length ?? 0;
    totalDeleted += lastBatchSize;
    batches += 1;
  } while (lastBatchSize === PURGE_BATCH_SIZE && batches < PURGE_MAX_BATCHES);

  return {
    cutoffAt: cutoff.toISOString(),
    deleted: totalDeleted,
    hasMore: lastBatchSize === PURGE_BATCH_SIZE && batches >= PURGE_MAX_BATCHES,
  };
}

