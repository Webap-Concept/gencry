"use server";

import { getAdminPath } from "@/lib/admin-nav";
import { updateAppSetting } from "@/lib/db/settings-queries";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";

export type ActionState =
  | {}
  | { success: string; timestamp: number }
  | { error: string; timestamp: number };

export async function saveCloudflareSettings(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("admin.services.actionMessages");
  try {
    const siteKey = ((formData.get("cf_turnstile_site_key") as string) ?? "").trim();
    const secretKey = ((formData.get("cf_turnstile_secret_key") as string) ?? "").trim();

    await updateAppSetting("cf_turnstile_site_key", siteKey || null);
    await updateAppSetting("cf_turnstile_secret_key", secretKey || null);

    revalidatePath(getAdminPath("services-cloudflare"));
    return { success: t("cloudflareSaved"), timestamp: Date.now() };
  } catch {
    return { error: t("cloudflareSaveFailed"), timestamp: Date.now() };
  }
}

export async function testCloudflareSettings(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("admin.services.actionMessages");
  try {
    const secretKey = ((formData.get("cf_turnstile_secret_key") as string) ?? "").trim();

    if (!secretKey) {
      return { error: t("cloudflareTestSecretRequired"), timestamp: Date.now() };
    }

    // Verifica la secret key con un token volutamente invalido.
    // Cloudflare risponde con success:false e error-codes contenenti
    // "invalid-input-secret" se la chiave non è valida,
    // oppure "invalid-input-response" se la chiave è corretta ma il token è sbagliato.
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: secretKey, response: "probe-token-invalid" }),
      cache: "no-store",
    });

    const data = (await res.json().catch(() => null)) as
      | { success: boolean; "error-codes"?: string[] }
      | null;

    if (!data) {
      return {
        error: t("cloudflareTestUnreadable", { status: res.status }),
        timestamp: Date.now(),
      };
    }

    const errorCodes = data["error-codes"] ?? [];

    if (errorCodes.includes("invalid-input-secret")) {
      return { error: t("cloudflareTestInvalidSecret"), timestamp: Date.now() };
    }

    if (
      errorCodes.includes("invalid-input-response") ||
      errorCodes.includes("timeout-or-duplicate")
    ) {
      return { success: t("cloudflareTestOk"), timestamp: Date.now() };
    }

    return { success: t("cloudflareTestOk"), timestamp: Date.now() };
  } catch {
    return { error: t("cloudflareTestNetworkFailed"), timestamp: Date.now() };
  }
}
