"use server";

import { getAdminPath } from "@/lib/admin-paths";
import { getAppSettings, updateAppSetting } from "@/lib/db/settings-queries";
import { checkAvatarsR2Connection } from "@/lib/storage/r2-avatars";
import {
  createConfigR2Client,
} from "@/lib/config/snapshot-storage/r2";
import { HeadBucketCommand } from "@aws-sdk/client-s3";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";

export type ActionState =
  | {}
  | { success: string; timestamp: number }
  | { error: string; timestamp: number };

// ─────────────────────────────────────────────────────────────────────────
// Turnstile (CAPTCHA) — niente a che vedere con R2.
// ─────────────────────────────────────────────────────────────────────────

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

    return { success: t("cloudflareTestOk"), timestamp: Date.now() };
  } catch {
    return { error: t("cloudflareTestNetworkFailed"), timestamp: Date.now() };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// R2 Account ID — chiave globale `storage.r2.account_id`.
// Vive una sola volta perché il Cloudflare account è unico per cliente;
// i singoli bucket (avatar / config / future) hanno invece il proprio token.
// ─────────────────────────────────────────────────────────────────────────

export async function saveR2AccountId(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const accountId = ((formData.get("storage.r2.account_id") as string) ?? "").trim();
    await updateAppSetting("storage.r2.account_id", accountId || null);
    revalidatePath(await getAdminPath("services-cloudflare"));
    return { success: "Cloudflare account ID saved.", timestamp: Date.now() };
  } catch {
    return { error: "Save failed.", timestamp: Date.now() };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// R2 storage — Config snapshot bucket (NUOVO).
// JSON di configurazione globale (vedi lib/config/snapshot-storage/).
// ─────────────────────────────────────────────────────────────────────────

export async function saveConfigR2Settings(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const accessKeyId  = ((formData.get("storage.config.r2.access_key_id")     as string) ?? "").trim();
    const secretRaw    = ((formData.get("storage.config.r2.secret_access_key") as string) ?? "").trim();
    const bucket       = ((formData.get("storage.config.r2.bucket")            as string) ?? "").trim();

    await updateAppSetting("storage.config.r2.access_key_id", accessKeyId || null);
    // Sentinel "********": non modificare. Stringa vuota: clear.
    if (secretRaw && secretRaw !== "********") {
      await updateAppSetting("storage.config.r2.secret_access_key", secretRaw);
    } else if (!secretRaw) {
      await updateAppSetting("storage.config.r2.secret_access_key", null);
    }
    await updateAppSetting("storage.config.r2.bucket", bucket || null);

    revalidatePath(await getAdminPath("services-cloudflare"));
    return { success: "Config snapshot R2 settings saved.", timestamp: Date.now() };
  } catch {
    return { error: "Save failed.", timestamp: Date.now() };
  }
}

export async function testConfigR2(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const settings = await getAppSettings();
    const accountId = (settings["storage.r2.account_id"] ?? "").trim();
    if (!accountId) {
      return {
        error: "Fill in and save the Cloudflare Account ID first.",
        timestamp: Date.now(),
      };
    }

    const accessKeyId = ((formData.get("storage.config.r2.access_key_id") as string) ?? "").trim();
    const secretRaw   = ((formData.get("storage.config.r2.secret_access_key") as string) ?? "").trim();
    const bucket      = ((formData.get("storage.config.r2.bucket") as string) ?? "").trim();

    let secretAccessKey = secretRaw;
    if (!secretAccessKey || secretAccessKey === "********") {
      secretAccessKey = (settings["storage.config.r2.secret_access_key"] ?? "").trim();
    }

    if (!accessKeyId || !secretAccessKey || !bucket) {
      return {
        error: "Fill in Access Key, Secret and Bucket (save the secret at least once) before testing.",
        timestamp: Date.now(),
      };
    }

    // Probe: HeadBucket — il modo più leggero per verificare credenziali +
    // permessi sul bucket specifico.
    const client = createConfigR2Client({ accountId, accessKeyId, secretAccessKey, bucket });
    try {
      await client.send(new HeadBucketCommand({ Bucket: bucket }));
      return {
        success: `R2 connection OK · bucket "${bucket}" reachable.`,
        timestamp: Date.now(),
      };
    } catch (err: unknown) {
      const code =
        (err as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } })?.name ??
        (err as { Code?: string })?.Code;
      const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
      if (status === 403 || code === "Forbidden") {
        return {
          error: "Forbidden — token does not have access to this bucket.",
          timestamp: Date.now(),
        };
      }
      if (status === 404 || code === "NoSuchBucket" || code === "NotFound") {
        return {
          error: `Bucket "${bucket}" not found on this Cloudflare account.`,
          timestamp: Date.now(),
        };
      }
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { error: message, timestamp: Date.now() };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Test failed.";
    return { error: message, timestamp: Date.now() };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// R2 storage — Avatars bucket (user profile images).
// ─────────────────────────────────────────────────────────────────────────

export async function saveAvatarR2Settings(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const accessKeyId  = ((formData.get("storage.avatar.r2.access_key_id")     as string) ?? "").trim();
    const secretRaw    = ((formData.get("storage.avatar.r2.secret_access_key") as string) ?? "").trim();
    const bucket       = ((formData.get("storage.avatar.r2.bucket")            as string) ?? "").trim();
    const publicBase   = ((formData.get("storage.avatar.r2.public_base_url")   as string) ?? "").trim().replace(/\/+$/, "");

    await updateAppSetting("storage.avatar.r2.access_key_id", accessKeyId || null);
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
    const settings = await getAppSettings();
    const accountId = (settings["storage.r2.account_id"] ?? "").trim();
    if (!accountId) {
      return {
        error: "Fill in and save the Cloudflare Account ID first.",
        timestamp: Date.now(),
      };
    }

    const accessKeyId  = ((formData.get("storage.avatar.r2.access_key_id")     as string) ?? "").trim();
    const secretRaw    = ((formData.get("storage.avatar.r2.secret_access_key") as string) ?? "").trim();
    const bucket       = ((formData.get("storage.avatar.r2.bucket")            as string) ?? "").trim();
    const publicBase   = ((formData.get("storage.avatar.r2.public_base_url")   as string) ?? "").trim().replace(/\/+$/, "");

    let secretAccessKey = secretRaw;
    if (!secretAccessKey || secretAccessKey === "********") {
      secretAccessKey = (settings["storage.avatar.r2.secret_access_key"] ?? "").trim();
    }

    if (!accessKeyId || !secretAccessKey || !bucket || !publicBase) {
      return {
        error: "Fill in all 4 R2 fields (and save the secret at least once) before testing.",
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
