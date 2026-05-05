"use server";

import { getAdminPath } from "@/lib/admin-nav";
import { invalidateRedisConfigCache } from "@/lib/bloom/bloom-filter";
import { updateAppSetting } from "@/lib/db/settings-queries";
import { runGenerators } from "@/lib/notifications/dispatcher";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";

export type ActionState =
  | {}
  | { success: string; timestamp: number }
  | { error: string; timestamp: number };

export async function saveRedisSettings(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("admin.services.actionMessages");
  try {
    const url = ((formData.get("upstash_redis_rest_url") as string) ?? "").trim();
    const token = ((formData.get("upstash_redis_rest_token") as string) ?? "").trim();
    await updateAppSetting("upstash_redis_rest_url", url || null);
    await updateAppSetting("upstash_redis_rest_token", token || null);

    // [FIX] Invalida la cache in-memory delle credenziali Redis nel modulo
    // bloom-filter, così la prossima chiamata redisPipeline() rilegge url/token
    // dal DB senza attendere il riavvio del processo Node.
    invalidateRedisConfigCache();

    // Chiude subito alert di rotazione per upstash_redis_rest_token.
    await runGenerators();

    revalidatePath(getAdminPath("services-redis"));
    return { success: t("redisSaved"), timestamp: Date.now() };
  } catch {
    return { error: t("redisSaveFailed"), timestamp: Date.now() };
  }
}

export async function testRedisConnection(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("admin.services.actionMessages");
  try {
    const url = ((formData.get("upstash_redis_rest_url") as string | null) ?? "").trim();
    const token = ((formData.get("upstash_redis_rest_token") as string | null) ?? "").trim();
    if (!url || !token) {
      return { error: t("redisTestCredentialsRequired"), timestamp: Date.now() };
    }
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(["PING"]),
      cache: "no-store",
    });
    if (!response.ok) {
      return {
        error: t("redisTestFailedStatus", { status: response.status }),
        timestamp: Date.now(),
      };
    }
    return { success: t("redisTestOk"), timestamp: Date.now() };
  } catch {
    return { error: t("redisTestFailed"), timestamp: Date.now() };
  }
}
