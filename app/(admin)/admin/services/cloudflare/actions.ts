"use server";

import { getAdminPath } from "@/lib/admin-paths";
import { getAppSettings, updateAppSetting } from "@/lib/db/settings-queries";
import { checkAvatarsR2Connection } from "@/lib/storage/r2-avatars";
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

    revalidatePath(await getAdminPath("services-cloudflare"));
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

// ─────────────────────────────────────────────────────────────────────────
// R2 storage per avatar utente — separate settings, separate token
// ─────────────────────────────────────────────────────────────────────────
//
// Vive nella stessa pagina admin (/admin/services/cloudflare) perché R2 è
// un servizio Cloudflare, ma settings + token sono completamente isolati
// dal modulo prices (`modules.prices.r2.*`). Vedi project_avatar_r2_refactor_todo.md
// per il razionale (isolamento moduli + token scoped per bucket).
export async function saveAvatarR2Settings(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const accountId    = ((formData.get("storage.avatar.r2.account_id")        as string) ?? "").trim();
    const accessKeyId  = ((formData.get("storage.avatar.r2.access_key_id")     as string) ?? "").trim();
    const secretRaw    = ((formData.get("storage.avatar.r2.secret_access_key") as string) ?? "").trim();
    const bucket       = ((formData.get("storage.avatar.r2.bucket")            as string) ?? "").trim();
    const publicBase   = ((formData.get("storage.avatar.r2.public_base_url")   as string) ?? "").trim().replace(/\/+$/, "");

    await updateAppSetting("storage.avatar.r2.account_id",        accountId   || null);
    await updateAppSetting("storage.avatar.r2.access_key_id",     accessKeyId || null);
    // Sentinel "********" significa "non modificare" (la UI mostra il
    // placeholder mascherato per non rivelare il secret salvato).
    if (secretRaw && secretRaw !== "********") {
      await updateAppSetting("storage.avatar.r2.secret_access_key", secretRaw);
    } else if (!secretRaw) {
      await updateAppSetting("storage.avatar.r2.secret_access_key", null);
    }
    await updateAppSetting("storage.avatar.r2.bucket",          bucket     || null);
    await updateAppSetting("storage.avatar.r2.public_base_url", publicBase || null);

    revalidatePath(await getAdminPath("services-cloudflare"));
    return { success: "Avatar R2 settings saved.", timestamp: Date.now() };
  } catch {
    return { error: "Save failed.", timestamp: Date.now() };
  }
}

export async function testAvatarR2(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const accountId    = ((formData.get("storage.avatar.r2.account_id")        as string) ?? "").trim();
    const accessKeyId  = ((formData.get("storage.avatar.r2.access_key_id")     as string) ?? "").trim();
    const secretRaw    = ((formData.get("storage.avatar.r2.secret_access_key") as string) ?? "").trim();
    const bucket       = ((formData.get("storage.avatar.r2.bucket")            as string) ?? "").trim();
    const publicBase   = ((formData.get("storage.avatar.r2.public_base_url")   as string) ?? "").trim().replace(/\/+$/, "");

    let secretAccessKey = secretRaw;
    if (!secretAccessKey || secretAccessKey === "********") {
      const settings = await getAppSettings();
      secretAccessKey = (settings["storage.avatar.r2.secret_access_key"] ?? "").trim();
    }

    if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBase) {
      return {
        error: "Fill in all 5 R2 fields (and save the secret at least once) before testing.",
        timestamp: Date.now(),
      };
    }

    const result = await checkAvatarsR2Connection({
      accountId,
      accessKeyId,
      secretAccessKey,
      bucket,
      publicBaseUrl: publicBase,
    });

    if (result.ok) {
      return {
        success: `R2 connection OK · bucket "${bucket}" reachable.`,
        timestamp: Date.now(),
      };
    }

    const message =
      result.reason === "forbidden"
        ? "Forbidden — the token does not have access to this bucket. Check Account ID, Access Key ID and Secret."
        : result.reason === "not_found"
          ? `Bucket "${bucket}" not found on this Cloudflare account.`
          : result.reason === "network"
            ? "Network error reaching the R2 endpoint. Check connectivity and Account ID."
            : result.reason === "timeout"
              ? "Timeout (10s) reaching R2. The endpoint did not respond in time."
              : `Unexpected error${result.detail ? `: ${result.detail}` : ""}.`;

    return { error: message, timestamp: Date.now() };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Test failed.";
    return { error: message, timestamp: Date.now() };
  }
}
