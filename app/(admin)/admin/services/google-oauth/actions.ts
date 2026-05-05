"use server";

import { getAdminPath } from "@/lib/admin-nav";
import { updateAppSetting } from "@/lib/db/settings-queries";
import { runGenerators } from "@/lib/notifications/dispatcher";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";

export type ActionState =
  | {}
  | { success: string; timestamp: number }
  | { error: string; timestamp: number };

export async function saveGoogleOAuthSettings(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("admin.services.actionMessages");
  try {
    const clientId = ((formData.get("google_client_id") as string) ?? "").trim();
    const clientSecret = ((formData.get("google_client_secret") as string) ?? "").trim();
    const redirectUri = ((formData.get("google_redirect_uri") as string) ?? "").trim();

    await updateAppSetting("google_client_id", clientId || null);
    await updateAppSetting("google_client_secret", clientSecret || null);
    await updateAppSetting("google_redirect_uri", redirectUri || null);

    // Chiude subito alert di rotazione per google_client_secret.
    await runGenerators();

    revalidatePath(getAdminPath("services-google"));
    return { success: t("googleOAuthSaved"), timestamp: Date.now() };
  } catch {
    return { error: t("googleOAuthSaveFailed"), timestamp: Date.now() };
  }
}

export async function testGoogleOAuthSettings(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("admin.services.actionMessages");
  try {
    const clientId = ((formData.get("google_client_id") as string | null) ?? "").trim();
    const clientSecret = ((formData.get("google_client_secret") as string | null) ?? "").trim();
    const redirectUri = ((formData.get("google_redirect_uri") as string | null) ?? "").trim();

    if (!clientId || !clientSecret || !redirectUri) {
      return { error: t("googleOAuthTestFieldsRequired"), timestamp: Date.now() };
    }

    const isLocalhost =
      redirectUri.startsWith("http://localhost") ||
      redirectUri.startsWith("http://127.0.0.1");
    if (!redirectUri.startsWith("https://") && !isLocalhost) {
      return {
        error: t("googleOAuthTestRedirectUriHttps"),
        timestamp: Date.now(),
      };
    }

    if (!clientId.endsWith(".apps.googleusercontent.com")) {
      return {
        error: t("googleOAuthTestInvalidClientId"),
        timestamp: Date.now(),
      };
    }

    // Probe del token endpoint con un authorization_code volutamente
    // invalido. Google distingue tra credenziali errate (invalid_client) e
    // codice non valido ma credenziali OK (invalid_grant): è il pattern
    // standard per validare client_id+secret senza completare un flow reale.
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: "invalid-probe-code",
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      }),
      cache: "no-store",
    });

    const data = (await res.json().catch(() => null)) as
      | { error?: string; error_description?: string }
      | null;

    if (!data) {
      return {
        error: t("googleOAuthTestUnreadable", { status: res.status }),
        timestamp: Date.now(),
      };
    }

    switch (data.error) {
      case "invalid_grant":
        return { success: t("googleOAuthTestOk"), timestamp: Date.now() };
      case "invalid_client":
        return { error: t("googleOAuthTestInvalidClient"), timestamp: Date.now() };
      case "redirect_uri_mismatch":
        return {
          error: t("googleOAuthTestRedirectUriMismatch"),
          timestamp: Date.now(),
        };
      case "unauthorized_client":
        return {
          error: t("googleOAuthTestUnauthorizedClient"),
          timestamp: Date.now(),
        };
      case undefined:
        return { success: t("googleOAuthTestOk"), timestamp: Date.now() };
      default:
        return {
          error: data.error_description
            ? t("googleOAuthTestUnknownErrorWithDescription", {
                error: data.error,
                description: data.error_description,
              })
            : t("googleOAuthTestUnknownError", { error: data.error }),
          timestamp: Date.now(),
        };
    }
  } catch {
    return {
      error: t("googleOAuthTestNetworkFailed"),
      timestamp: Date.now(),
    };
  }
}
