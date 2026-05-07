"use server";

import { getAdminPath } from "@/lib/admin-nav";
import {
  checkBucket,
  type S3Status,
} from "@/lib/admin/storage/s3-client";
import { batchUpdateAppSettings } from "@/lib/db/settings-queries";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";

export type ActionState =
  | Record<string, never>
  | { success: string; timestamp: number }
  | { error: string; timestamp: number };

/**
 * Salva le credenziali S3 nelle app_settings via singola batch upsert.
 * Niente test connessione qui — il bottone "Verify" è separato.
 */
export async function saveS3Settings(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("admin.services.actionMessages");
  try {
    const endpoint = ((formData.get("s3.endpoint") as string) ?? "").trim();
    const region = ((formData.get("s3.region") as string) ?? "").trim();
    const bucket = ((formData.get("s3.bucket") as string) ?? "").trim();
    const accessKeyId = ((formData.get("s3.access_key_id") as string) ?? "").trim();
    const secretAccessKey = ((formData.get("s3.secret_access_key") as string) ?? "").trim();
    const backupPrefix = ((formData.get("s3.backup_prefix") as string) ?? "").trim();

    // Validazione URL endpoint
    if (endpoint) {
      try {
        new URL(endpoint);
      } catch {
        return { error: t("s3SaveInvalidEndpoint"), timestamp: Date.now() };
      }
    }

    await batchUpdateAppSettings({
      "s3.endpoint": endpoint || null,
      "s3.region": region || null,
      "s3.bucket": bucket || null,
      "s3.access_key_id": accessKeyId || null,
      "s3.secret_access_key": secretAccessKey || null,
      "s3.backup_prefix": backupPrefix || null,
    });

    revalidatePath(getAdminPath("services-storage-s3"));
    revalidatePath(getAdminPath("compliance-gdpr"));
    return { success: t("s3Saved"), timestamp: Date.now() };
  } catch {
    return { error: t("s3SaveFailed"), timestamp: Date.now() };
  }
}

/**
 * Test connessione live: usa i valori del FORM (non quelli persistiti)
 * così l'admin può verificare prima di salvare. HEAD del bucket via
 * SigV4. Mappa lo status a stringhe localizzate.
 */
export async function testS3Connection(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("admin.services.actionMessages");
  try {
    const endpoint = ((formData.get("s3.endpoint") as string) ?? "").trim();
    const region = ((formData.get("s3.region") as string) ?? "").trim();
    const bucket = ((formData.get("s3.bucket") as string) ?? "").trim();
    const accessKeyId = ((formData.get("s3.access_key_id") as string) ?? "").trim();
    const secretAccessKey = ((formData.get("s3.secret_access_key") as string) ?? "").trim();

    if (!endpoint || !region || !bucket || !accessKeyId || !secretAccessKey) {
      return { error: t("s3TestCredentialsRequired"), timestamp: Date.now() };
    }

    const result = await checkBucket({
      endpoint,
      region,
      bucket,
      accessKeyId,
      secretAccessKey,
    });

    if (result.status === "ok") {
      return {
        success: t("s3TestOk", { bucket }),
        timestamp: Date.now(),
      };
    }

    const map: Record<S3Status, string> = {
      ok: "s3TestOk",
      invalid_credentials: "s3TestInvalidCredentials",
      forbidden: "s3TestForbidden",
      not_found: "s3TestBucketNotFound",
      credentials_missing: "s3TestCredentialsRequired",
      endpoint_invalid: "s3SaveInvalidEndpoint",
      network_error: "s3TestNetworkFailed",
      unknown: "s3TestUnknown",
    };
    return {
      error: t(map[result.status] as Parameters<typeof t>[0], {
        bucket,
        status: result.httpStatus ?? 0,
      }),
      timestamp: Date.now(),
    };
  } catch {
    return { error: t("s3TestNetworkFailed"), timestamp: Date.now() };
  }
}
