"use server";

import { getAdminPath } from "@/lib/admin-paths";
import {
  checkProjectConnection,
  type SupabaseError,
} from "@/lib/admin/supabase/management";
import { batchUpdateAppSettings } from "@/lib/db/settings-queries";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";

export type ActionState =
  | Record<string, never>
  | { success: string; timestamp: number }
  | { error: string; timestamp: number };

const PROJECT_REF_REGEX = /^[a-z0-9]{16,32}$/i;

/**
 * Salva PAT + project_ref nelle app_settings. Niente test connessione qui:
 * l'admin può salvare anche credenziali parziali (es. solo project_ref
 * ora, PAT più tardi). Il bottone "Verify connection" è separato.
 */
export async function saveSupabaseSettings(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("admin.services.actionMessages");
  try {
    const pat = ((formData.get("supabase_pat") as string) ?? "").trim();
    const projectRef = ((formData.get("supabase_project_ref") as string) ?? "").trim();

    if (projectRef && !PROJECT_REF_REGEX.test(projectRef)) {
      return {
        error: t("supabaseSaveInvalidProjectRef"),
        timestamp: Date.now(),
      };
    }

    await batchUpdateAppSettings({
      supabase_pat: pat || null,
      supabase_project_ref: projectRef || null,
    });

    revalidatePath(await getAdminPath("services-supabase"));
    revalidatePath(await getAdminPath("compliance-gdpr"));
    return { success: t("supabaseSaved"), timestamp: Date.now() };
  } catch {
    return { error: t("supabaseSaveFailed"), timestamp: Date.now() };
  }
}

/**
 * Test live: chiama la Management API col PAT + ref correnti del FORM
 * (non quelli nel DB) così l'admin può verificare prima di salvare.
 */
export async function testSupabaseConnection(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("admin.services.actionMessages");
  try {
    const pat = ((formData.get("supabase_pat") as string | null) ?? "").trim();
    const projectRef = ((formData.get("supabase_project_ref") as string | null) ?? "").trim();

    if (!pat || !projectRef) {
      return {
        error: t("supabaseTestCredentialsRequired"),
        timestamp: Date.now(),
      };
    }
    if (!PROJECT_REF_REGEX.test(projectRef)) {
      return {
        error: t("supabaseSaveInvalidProjectRef"),
        timestamp: Date.now(),
      };
    }

    const result = await checkProjectConnection({ pat, projectRef });

    if (result.ok) {
      return {
        success: t("supabaseTestOk", {
          name: result.project.name,
          tier: result.project.tier.toUpperCase(),
          region: result.project.region,
        }),
        timestamp: Date.now(),
      };
    }

    const errorMsgKey: Record<SupabaseError, string> = {
      credentials_missing: "supabaseTestCredentialsRequired",
      invalid_token: "supabaseTestInvalidToken",
      forbidden: "supabaseTestForbidden",
      project_not_found: "supabaseTestProjectNotFound",
      network_error: "supabaseTestNetworkFailed",
      unexpected_response: "supabaseTestUnexpectedResponse",
    };
    return {
      error: t(errorMsgKey[result.error] as Parameters<typeof t>[0]),
      timestamp: Date.now(),
    };
  } catch {
    return { error: t("supabaseTestNetworkFailed"), timestamp: Date.now() };
  }
}
