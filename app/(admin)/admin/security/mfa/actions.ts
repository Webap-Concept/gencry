"use server";

import {
  batchUpdateAppSettings,
  getAppSettings,
} from "@/lib/db/settings-queries";
import { db } from "@/lib/db/drizzle";
import { userMfaTotp } from "@/lib/db/schema";
import { count, isNotNull } from "drizzle-orm";
import { updateTag } from "next/cache";
import { getTranslations } from "next-intl/server";
import { MFA_POLICY_TAG } from "@/lib/auth/mfa/policy";
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

type Translator = Awaited<ReturnType<typeof getTranslations>>;

/**
 * Helper interno: tenta di caricare il translator di next-intl, fallisce
 * con un translator-stub che ritorna la key stessa se la pipeline i18n ha
 * un problema. Senza questo, un'eccezione di `getTranslations` saliva al
 * runtime di Vercel come 500 prima che il client vedesse l'ActionState.
 */
async function safeT(): Promise<Translator> {
  try {
    return await getTranslations("admin.security.mfa.actionMessages");
  } catch (err) {
    console.error("[admin/security/mfa] getTranslations failed:", err);
    // Stub: ritorna la chiave invece che il messaggio tradotto. Worst case,
    // il toast mostra "saveFailed" raw — leggibile, non rompe nulla.
    const stub = ((key: string) => key) as unknown as Translator;
    return stub;
  }
}

export async function saveMfaSettings(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await safeT();
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

    // Manage `mfa.required_since` automatically.
    // Wrappato a parte: se la lettura dei settings correnti fallisce non
    // vogliamo abortire l'intero save — assumiamo "non era required" come
    // safe default e lasciamo che il prossimo save corregga.
    let requiredSince: string | null = null;
    try {
      const current = await getAppSettings();
      const wasRequired = current["mfa.mode"] !== "optional";
      const willBeRequired = modeRaw !== "optional";
      requiredSince = current["mfa.required_since"] ?? null;
      if (!wasRequired && willBeRequired) {
        requiredSince = new Date().toISOString();
      } else if (wasRequired && !willBeRequired) {
        requiredSince = null;
      }
    } catch (err) {
      console.error(
        "[admin/security/mfa] reading current settings for required_since failed:",
        err,
      );
      // Fallback: se siamo passando a required-* settiamo comunque now,
      // così il countdown parte. Se siamo passando a optional, null.
      requiredSince = modeRaw !== "optional" ? new Date().toISOString() : null;
    }

    await batchUpdateAppSettings({
      "mfa.enabled": enabled ? "true" : "false",
      "mfa.mode": modeRaw,
      "mfa.grace_period_days": String(grace),
      "mfa.issuer_label": issuerRaw || null,
      "mfa.required_since": requiredSince,
    });

    // Invalida la cache di getMfaPolicy: il (protected)/layout legge
    // la policy a ogni navigazione, vogliamo che il nuovo mode sia
    // visibile subito (entro la prossima request) invece di aspettare
    // il revalidate ciclico di 60s.
    updateTag(MFA_POLICY_TAG);

    return { success: t("saved"), timestamp: Date.now() };
  } catch (err) {
    console.error("[admin/security/mfa] saveMfaSettings failed:", err);
    return { error: t("saveFailed"), timestamp: Date.now() };
  }
}
