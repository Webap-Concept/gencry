"use server";

import { getAdminPath } from "@/lib/admin-paths";
import { updateAppSetting } from "@/lib/db/settings-queries";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";

export type ActionState =
  | {}
  | { success: string; timestamp: number }
  | { error: string; timestamp: number };

export async function saveQstashSettings(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("admin.services.actionMessages");
  try {
    const url = ((formData.get("qstash_url") as string) ?? "").trim();
    const token = ((formData.get("qstash_token") as string) ?? "").trim();
    const current = (
      (formData.get("qstash_current_signing_key") as string) ?? ""
    ).trim();
    const next = (
      (formData.get("qstash_next_signing_key") as string) ?? ""
    ).trim();
    // updateAppSetting fa no-op se il valore è identico a quello in DB (non
    // bumiamo updated_at inutilmente). Per le chiavi qstash (aggiunte dopo il
    // primo snapshot R2) questo no-op impediva la sync dello snapshot quando il
    // token era già salvato. Forziamo la sync dell'intero snapshot PRIMA di
    // salvare, così anche un re-save identico aggiorna lo snapshot stale.
    const { forceSyncAppSettingsSnapshot } = await import(
      "@/lib/db/settings-queries"
    );
    await forceSyncAppSettingsSnapshot();
    await updateAppSetting("qstash_url", url || null);
    await updateAppSetting("qstash_token", token || null);
    await updateAppSetting("qstash_current_signing_key", current || null);
    await updateAppSetting("qstash_next_signing_key", next || null);

    revalidatePath(await getAdminPath("services-qstash"));
    return { success: t("qstashSaved"), timestamp: Date.now() };
  } catch {
    return { error: t("qstashSaveFailed"), timestamp: Date.now() };
  }
}

export async function testQstashConnection(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("admin.services.actionMessages");
  try {
    const token = ((formData.get("qstash_token") as string | null) ?? "").trim();
    if (!token) {
      return { error: t("qstashTestCredentialsRequired"), timestamp: Date.now() };
    }
    // URL region-specific dal form; fallback all'endpoint globale. QStash è
    // regionale (es. qstash-eu-central-1.upstash.io) — niente hardcode.
    const rawUrl = ((formData.get("qstash_url") as string | null) ?? "").trim();
    const base = (rawUrl || "https://qstash.upstash.io").replace(/\/+$/, "");
    // GET /v2/schedules è la chiamata più innocua autenticata: 200 = token
    // valido, niente side-effect. Conferma che potremo creare/leggere
    // schedule con queste credenziali.
    const response = await fetch(`${base}/v2/schedules`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!response.ok) {
      return {
        error: t("qstashTestFailedStatus", { status: response.status }),
        timestamp: Date.now(),
      };
    }
    return { success: t("qstashTestOk"), timestamp: Date.now() };
  } catch {
    return { error: t("qstashTestFailed"), timestamp: Date.now() };
  }
}
