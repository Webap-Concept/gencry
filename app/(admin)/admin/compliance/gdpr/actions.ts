"use server";

import { getAdminPath } from "@/lib/admin-nav";
import {
  checkSupabaseConnection,
  type SupabaseError,
} from "@/lib/admin/supabase/management";
import { batchUpdateAppSettings, type AppSettings } from "@/lib/db/settings-queries";
import { requireAdmin } from "@/lib/rbac/guards";
import { can } from "@/lib/rbac/can";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";

export type ActionState =
  | Record<string, never>
  | { success: string; timestamp: number }
  | { error: string; timestamp: number };

const IP_STRATEGIES = new Set(["full", "mask_last_octet", "hash_only"]);
const BACKUP_TIERS = new Set(["none", "supabase_pitr", "external"]);
const BACKUP_FREQUENCIES = new Set([
  "hourly",
  "daily",
  "weekly",
  "monthly",
  "custom",
]);

function clampInt(
  raw: FormDataEntryValue | null,
  min: number,
  max: number,
  fallback: number,
): string {
  const n = raw == null ? NaN : Number(String(raw));
  if (!Number.isFinite(n) || n < min || n > max) return String(fallback);
  return String(Math.trunc(n));
}

function readBool(raw: FormDataEntryValue | null): "true" | "false" {
  return raw === "true" || raw === "on" ? "true" : "false";
}

function readEnum(
  raw: FormDataEntryValue | null,
  allowed: Set<string>,
  fallback: string,
): string {
  const v = raw == null ? "" : String(raw).trim();
  return allowed.has(v) ? v : fallback;
}

export async function saveGdprSettingsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("admin.compliance.gdpr.settings");
  try {
    const user = await requireAdmin();
    if (!user.isAdmin && !(await can(user, "admin:gdpr"))) {
      return { error: t("errorNotAuthorized"), timestamp: Date.now() };
    }

    // Le 13 chiavi GDPR vanno in un unico batch upsert: 2 query totali
    // (1 SELECT + 1 INSERT … ON CONFLICT) invece di 13 × 2 = 26 query
    // sequenziali. Su Supabase EU bastano per saturare il pool e far
    // percepire all'utente la pagina come "bloccata".
    const notesRaw = (formData.get("gdpr.backup.notes") as string | null) ?? "";
    const notes = notesRaw.trim().slice(0, 2000);

    // External backup — campi strutturati. Salvati anche se l'admin
    // ha un tier diverso, così switching back/forth non perde i dati.
    const extProvider = ((formData.get("gdpr.backup.external.provider") as string | null) ?? "").trim().slice(0, 200);
    const extFrequency = readEnum(
      formData.get("gdpr.backup.external.frequency"),
      BACKUP_FREQUENCIES,
      "daily",
    );
    const extRetention = clampInt(
      formData.get("gdpr.backup.external.retention_days"),
      0,
      36500,
      30,
    );
    const extLastVerifiedAtRaw =
      ((formData.get("gdpr.backup.external.last_verified_at") as string | null) ?? "").trim();
    // Accetta solo formato YYYY-MM-DD (input type="date") per evitare schifezze
    const extLastVerifiedAt = /^\d{4}-\d{2}-\d{2}$/.test(extLastVerifiedAtRaw)
      ? extLastVerifiedAtRaw
      : null;
    const extLastVerifiedBy =
      ((formData.get("gdpr.backup.external.last_verified_by") as string | null) ?? "").trim().slice(0, 200);
    const extRecoveryNotesRaw =
      ((formData.get("gdpr.backup.external.recovery_test_notes") as string | null) ?? "").trim();
    const extRecoveryNotes = extRecoveryNotesRaw.slice(0, 2000);

    const updates: Partial<Record<keyof AppSettings, string | null>> = {
      // Consent logging
      "gdpr.consent_log.enabled": readBool(
        formData.get("gdpr.consent_log.enabled"),
      ),
      "gdpr.consent_log.capture_ip": readBool(
        formData.get("gdpr.consent_log.capture_ip"),
      ),
      "gdpr.consent_log.ip_strategy": readEnum(
        formData.get("gdpr.consent_log.ip_strategy"),
        IP_STRATEGIES,
        "full",
      ),
      "gdpr.consent_log.capture_user_agent": readBool(
        formData.get("gdpr.consent_log.capture_user_agent"),
      ),
      "gdpr.consent_log.hash_policy_text": readBool(
        formData.get("gdpr.consent_log.hash_policy_text"),
      ),
      "gdpr.consent_log.retention_after_deletion_days": clampInt(
        formData.get("gdpr.consent_log.retention_after_deletion_days"),
        0,
        3650,
        1825,
      ),
      // Backup
      "gdpr.backup.tier": readEnum(
        formData.get("gdpr.backup.tier"),
        BACKUP_TIERS,
        "none",
      ),
      "gdpr.backup.notes": notes.length > 0 ? notes : null,
      // External structured fields (sopravvivono al cambio tier)
      "gdpr.backup.external.provider": extProvider || null,
      "gdpr.backup.external.frequency": extFrequency,
      "gdpr.backup.external.retention_days": extRetention,
      "gdpr.backup.external.last_verified_at": extLastVerifiedAt,
      "gdpr.backup.external.last_verified_by": extLastVerifiedBy || null,
      "gdpr.backup.external.recovery_test_notes": extRecoveryNotes || null,
      // Lifecycle
      "gdpr.deletion.grace_days": clampInt(
        formData.get("gdpr.deletion.grace_days"),
        0,
        365,
        30,
      ),
      "gdpr.export.rate_limit_days": clampInt(
        formData.get("gdpr.export.rate_limit_days"),
        0,
        365,
        7,
      ),
      // Policy enforcement
      "gdpr.policy.force_reconsent_on_change": readBool(
        formData.get("gdpr.policy.force_reconsent_on_change"),
      ),
      "gdpr.policy.reconsent_grace_days": clampInt(
        formData.get("gdpr.policy.reconsent_grace_days"),
        0,
        365,
        14,
      ),
      "gdpr.policy.notifications_cron_minutes": clampInt(
        formData.get("gdpr.policy.notifications_cron_minutes"),
        1,
        1440,
        60,
      ),
    };

    await batchUpdateAppSettings(updates);

    revalidatePath(getAdminPath("compliance-gdpr"));
    return { success: t("feedbackSaved"), timestamp: Date.now() };
  } catch {
    return { error: t("feedbackError"), timestamp: Date.now() };
  }
}

// ─── PITR verification ──────────────────────────────────────────────────────
//
// Chiamata on-demand dal bottone "Verify PITR now" nella sezione Backup.
// Hits the Supabase Management API → ottiene il tier corrente del progetto
// e lo persiste in `gdpr.backup.pitr.last_verified_*` per audit.
// Niente automatic polling: l'admin sceglie quando rinfrescare il check.

const PITR_TIERS = new Set(["pro", "team", "enterprise"]);

export async function verifyPitrAction(): Promise<ActionState> {
  const t = await getTranslations("admin.compliance.gdpr.settings");
  try {
    const user = await requireAdmin();
    if (!user.isAdmin && !(await can(user, "admin:gdpr"))) {
      return { error: t("errorNotAuthorized"), timestamp: Date.now() };
    }

    const result = await checkSupabaseConnection();
    if (!result.ok) {
      const map: Record<SupabaseError, string> = {
        credentials_missing: "pitrErrorCredentialsMissing",
        invalid_token: "pitrErrorInvalidToken",
        forbidden: "pitrErrorForbidden",
        project_not_found: "pitrErrorProjectNotFound",
        network_error: "pitrErrorNetworkFailed",
        unexpected_response: "pitrErrorUnexpectedResponse",
      };
      return {
        error: t(map[result.error] as Parameters<typeof t>[0]),
        timestamp: Date.now(),
      };
    }

    // Persistiamo il timestamp E il tier osservato — anche `free` o
    // `unknown`. La UI decide se è verde o rosso in base al tier.
    await batchUpdateAppSettings({
      "gdpr.backup.pitr.last_verified_at": new Date().toISOString(),
      "gdpr.backup.pitr.last_verified_tier": result.project.tier,
    });

    revalidatePath(getAdminPath("compliance-gdpr"));

    if (PITR_TIERS.has(result.project.tier)) {
      return {
        success: t("pitrVerifiedSupported", {
          tier: result.project.tier.toUpperCase(),
        }),
        timestamp: Date.now(),
      };
    }
    return {
      error: t("pitrVerifiedUnsupported", {
        tier: result.project.tier.toUpperCase(),
      }),
      timestamp: Date.now(),
    };
  } catch {
    return { error: t("pitrErrorNetworkFailed"), timestamp: Date.now() };
  }
}
