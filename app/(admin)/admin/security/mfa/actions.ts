"use server";

import {
  batchUpdateAppSettings,
  getAppSettings,
} from "@/lib/db/settings-queries";
import { db } from "@/lib/db/drizzle";
import { userMfaTotp } from "@/lib/db/schema";
import { count, isNotNull } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { isMfaMode } from "./_components/mfa-modes";

// File con `"use server"`: tutti gli export devono essere async functions.
// Costanti / type / arrays vivono in `_components/mfa-modes.ts`.
//
// `ActionState` è un type (zero runtime cost), va bene esportarlo qui.

export type ActionState =
  | Record<string, never>
  | { success: string; timestamp: number }
  | { error: string; timestamp: number };

const GRACE_MIN = 0;
const GRACE_MAX = 90;

export async function saveMfaSettings(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("admin.security.mfa.actionMessages");
  try {
    const enabledRaw = String(formData.get("mfa.enabled") ?? "false");
    const enabled = enabledRaw === "true";

    const modeRaw = String(formData.get("mfa.mode") ?? "optional").trim();
    if (!isMfaMode(modeRaw)) {
      return { error: t("invalidMode"), timestamp: Date.now() };
    }

    const graceRaw = String(formData.get("mfa.grace_period_days") ?? "7").trim();
    const grace = Number(graceRaw);
    if (!Number.isInteger(grace) || grace < GRACE_MIN || grace > GRACE_MAX) {
      return { error: t("invalidGracePeriod"), timestamp: Date.now() };
    }

    const issuerRaw = String(formData.get("mfa.issuer_label") ?? "").trim();
    if (issuerRaw.length > 100) {
      return { error: t("issuerTooLong"), timestamp: Date.now() };
    }

    // Block disable globale se ci sono utenti già enrolled.
    // L'admin deve prima disabilitare MFA su quegli utenti (uno per volta dal
    // pannello user) o cancellarne l'enrollment via DB. Decisione safe:
    // evita che un toggle "Off" lasci utenti che si sono dimenticati di
    // togliere MFA bloccati al login.
    if (!enabled) {
      const [row] = await db
        .select({ n: count() })
        .from(userMfaTotp)
        .where(isNotNull(userMfaTotp.enabledAt));
      const enrolled = row?.n ?? 0;
      if (enrolled > 0) {
        return {
          error: t("cannotDisableWithEnrolled", { count: enrolled }),
          timestamp: Date.now(),
        };
      }
    }

    // Manage `mfa.required_since` automatically:
    // - optional → required-*: set to now() (parte il countdown del grace)
    // - required-* → optional:  clear (no enforcement attivo)
    // - required-* → required-* (cambio sub-mode): non si tocca; staff/all
    //   condividono il timestamp di partenza (semplificazione v1)
    const current = await getAppSettings();
    const wasRequired = current["mfa.mode"] !== "optional";
    const willBeRequired = modeRaw !== "optional";
    let requiredSince: string | null = current["mfa.required_since"] ?? null;
    if (!wasRequired && willBeRequired) {
      requiredSince = new Date().toISOString();
    } else if (wasRequired && !willBeRequired) {
      requiredSince = null;
    }

    await batchUpdateAppSettings({
      "mfa.enabled": enabled ? "true" : "false",
      "mfa.mode": modeRaw,
      "mfa.grace_period_days": String(grace),
      "mfa.issuer_label": issuerRaw || null,
      "mfa.required_since": requiredSince,
    });

    return { success: t("saved"), timestamp: Date.now() };
  } catch (err) {
    console.error("[admin/security/mfa] saveMfaSettings failed:", err);
    return { error: t("saveFailed"), timestamp: Date.now() };
  }
}
