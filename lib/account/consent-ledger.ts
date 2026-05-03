import "server-only";

import { db } from "@/lib/db/drizzle";
import { consentRecords } from "@/lib/db/schema";
import type {
  ConsentAction,
  ConsentIpStrategy,
  ConsentType,
} from "@/lib/db/schema";
import { getAppSettings } from "@/lib/db/settings-queries";
import { createHash } from "node:crypto";
import { applyConsentLogPolicy } from "./consent-ledger-pure";

export type ConsentSource =
  | "signup"
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
