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
    const token = ((formData.get("qstash_token") as string) ?? "").trim();
    const current = (
      (formData.get("qstash_current_signing_key") as string) ?? ""
    ).trim();
    const next = (
      (formData.get("qstash_next_signing_key") as string) ?? ""
    ).trim();
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
    // GET /v2/schedules è la chiamata più innocua autenticata: 200 = token
    // valido, niente side-effect. Conferma che potremo creare/leggere
    // schedule con queste credenziali.
    const response = await fetch("https://qstash.upstash.io/v2/schedules", {
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
