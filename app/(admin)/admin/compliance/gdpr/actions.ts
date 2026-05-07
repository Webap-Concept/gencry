"use server";

import { getAdminPath } from "@/lib/admin-nav";
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
