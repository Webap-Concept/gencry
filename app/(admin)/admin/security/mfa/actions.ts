"use server";

import { batchUpdateAppSettings } from "@/lib/db/settings-queries";
import { db } from "@/lib/db/drizzle";
import { userMfaTotp } from "@/lib/db/schema";
import { count, isNotNull } from "drizzle-orm";
import { getTranslations } from "next-intl/server";

export type ActionState =
  | Record<string, never>
  | { success: string; timestamp: number }
  | { error: string; timestamp: number };

export const MFA_MODES = [
  "optional",
  "required-for-staff",
  "required-for-all",
] as const;
export type MfaMode = (typeof MFA_MODES)[number];

const GRACE_MIN = 0;
const GRACE_MAX = 90;

function isMfaMode(v: string): v is MfaMode {
  return (MFA_MODES as readonly string[]).includes(v);
}

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

    await batchUpdateAppSettings({
      "mfa.enabled": enabled ? "true" : "false",
      "mfa.mode": modeRaw,
      "mfa.grace_period_days": String(grace),
      "mfa.issuer_label": issuerRaw || null,
    });

    return { success: t("saved"), timestamp: Date.now() };
  } catch (err) {
    console.error("[admin/security/mfa] saveMfaSettings failed:", err);
    return { error: t("saveFailed"), timestamp: Date.now() };
  }
}
