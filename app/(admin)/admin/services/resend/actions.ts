"use server";

import { getAdminPath } from "@/lib/admin-paths";
import { updateAppSetting } from "@/lib/db/settings-queries";
import { runGenerators } from "@/lib/notifications/dispatcher";
import { getTranslations } from "next-intl/server";

export type ActionState =
  | {}
  | { success: string; timestamp: number }
  | { error: string; timestamp: number };

export async function saveSenderSettings(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("admin.services.actionMessages");
  try {
    await updateAppSetting(
      "resend_api_key",
      formData.get("resend_api_key") as string,
    );
    await updateAppSetting(
      "email_from_name",
      formData.get("email_from_name") as string,
    );
    await updateAppSetting(
      "email_from_address",
      formData.get("email_from_address") as string,
    );
    // Esecuzione esplicita: chiude subito eventuali alert di rotazione
    // per resend_api_key se il valore e' stato aggiornato.
    await runGenerators();
    await getAdminPath("services-resend");
    return { success: t("resendSaved"), timestamp: Date.now() };
  } catch {
    return { error: t("resendSaveFailed"), timestamp: Date.now() };
  }
}

export async function testResendConnection(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("admin.services.actionMessages");
  try {
    const apiKey = (
      (formData.get("resend_api_key") as string | null) ?? ""
    ).trim();
    if (!apiKey) {
      return {
        error: t("resendTestApiKeyRequired"),
        timestamp: Date.now(),
      };
    }
    const response = await fetch("https://api.resend.com/domains", {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });
    if (!response.ok) {
      return {
        error: t("resendTestFailedStatus", { status: response.status }),
        timestamp: Date.now(),
      };
    }
    return { success: t("resendTestOk"), timestamp: Date.now() };
  } catch {
    return { error: t("resendTestFailed"), timestamp: Date.now() };
  }
}
