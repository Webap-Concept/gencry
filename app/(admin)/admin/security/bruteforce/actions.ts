"use server";

import { getAdminPath } from "@/lib/admin-paths";
import {
  blacklistIp,
  getBlacklist,
  getTopOffenders,
  removeFromBlacklist,
  unblockIp,
} from "@/lib/auth/rate-limit";
import { syncIpBlacklistToRedis } from "@/lib/auth/rate-limit-redis";
import { getAppSettings, updateAppSetting } from "@/lib/db/settings-queries";
import { requireAdminPage } from "@/lib/rbac/guards";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const ipSchema = z
  .string()
  .regex(
    /^(\d{1,3}\.){3}\d{1,3}$|^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/,
    "errorInvalidIp",
  );

export async function getBruteforceData() {
  await requireAdminPage();
  const [offenders, blacklist, settings] = await Promise.all([
    getTopOffenders(100),
    getBlacklist(),
    getAppSettings(),
  ]);
  return {
    offenders,
    blacklist,
    config: {
      // Login
      signinMax:      parseInt(settings.bf_signin_max,      10) || 5,
      // Registrazione
      signupMax:      parseInt(settings.bf_signup_max,      10) || 10,
      // Check disponibilità email/username
      checkMax:       parseInt(settings.bf_check_max,       10) || 30,
      checkWindow:    parseInt(settings.bf_check_window,    10) || 5,
      // Comuni
      windowMinutes:  parseInt(settings.bf_window_minutes,  10) || 15,
      lockoutMinutes: parseInt(settings.bf_lockout_minutes, 10) || 30,
      alertThreshold: parseInt(settings.bf_alert_threshold, 10) || 20,
    },
  };
}

export async function actionUnblockIp(formData: FormData) {
  await requireAdminPage();
  const ip = ipSchema.parse(formData.get("ip"));
  await unblockIp(ip);
  revalidatePath(await getAdminPath("security-bruteforce"));
  return { ok: true };
}

export async function actionBlacklistIp(formData: FormData) {
  await requireAdminPage();
  const ip     = ipSchema.parse(formData.get("ip"));
  const reason = (formData.get("reason") as string | null) ?? undefined;
  await blacklistIp(ip, reason);
  await syncIpBlacklistToRedis(ip, true);
  revalidatePath(await getAdminPath("security-bruteforce"));
  return { ok: true };
}

export async function actionRemoveFromBlacklist(formData: FormData) {
  await requireAdminPage();
  const ip = ipSchema.parse(formData.get("ip"));
  await removeFromBlacklist(ip);
  await syncIpBlacklistToRedis(ip, false);
  revalidatePath(await getAdminPath("security-bruteforce"));
  return { ok: true };
}

const ConfigSchema = z.object({
  bf_signin_max:      z.coerce.number().int().min(1).max(100),
  bf_signup_max:      z.coerce.number().int().min(1).max(100),
  bf_check_max:       z.coerce.number().int().min(1).max(500),
  bf_check_window:    z.coerce.number().int().min(1).max(60),
  bf_window_minutes:  z.coerce.number().int().min(1).max(1440),
  bf_lockout_minutes: z.coerce.number().int().min(1).max(10080),
  bf_alert_threshold: z.coerce.number().int().min(1).max(1000),
});

export async function actionUpdateBruteforceConfig(formData: FormData) {
  await requireAdminPage();
  const parsed = ConfigSchema.safeParse({
    bf_signin_max:      formData.get("bf_signin_max"),
    bf_signup_max:      formData.get("bf_signup_max"),
    bf_check_max:       formData.get("bf_check_max"),
    bf_check_window:    formData.get("bf_check_window"),
    bf_window_minutes:  formData.get("bf_window_minutes"),
    bf_lockout_minutes: formData.get("bf_lockout_minutes"),
    bf_alert_threshold: formData.get("bf_alert_threshold"),
  });
  if (!parsed.success) {
    const t = await getTranslations("admin.security.bruteforce");
    return { ok: false, error: t("errorInvalidValues") };
  }
  await Promise.all([
    updateAppSetting("bf_signin_max",      String(parsed.data.bf_signin_max)),
    updateAppSetting("bf_signup_max",      String(parsed.data.bf_signup_max)),
    updateAppSetting("bf_check_max",       String(parsed.data.bf_check_max)),
    updateAppSetting("bf_check_window",    String(parsed.data.bf_check_window)),
    updateAppSetting("bf_window_minutes",  String(parsed.data.bf_window_minutes)),
    updateAppSetting("bf_lockout_minutes", String(parsed.data.bf_lockout_minutes)),
    updateAppSetting("bf_alert_threshold", String(parsed.data.bf_alert_threshold)),
  ]);
  revalidatePath(await getAdminPath("security-bruteforce"));
  return { ok: true };
}
