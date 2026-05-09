"use server";

import { getAdminPath } from "@/lib/admin-paths";
import { batchUpdateAppSettings } from "@/lib/db/settings-queries";
import { can } from "@/lib/rbac/can";
import { requireAdmin } from "@/lib/rbac/guards";
import { isValidDsn } from "@/lib/sentry/config";
import { testSentryConnection } from "@/lib/sentry/test-connection";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";

export type ActionState =
  | Record<string, never>
  | { success: string; timestamp: number }
  | { error: string; timestamp: number };

async function requireSettingsAdmin() {
  const user = await requireAdmin();
  if (!user.isAdmin && !(await can(user, "admin:settings"))) {
    throw new Error("Non autorizzato");
  }
  return user;
}

function clampRate(raw: string | null | undefined): string {
  if (raw == null || raw === "") return "0";
  const n = Number(raw);
  if (!Number.isFinite(n)) return "0";
  if (n < 0) return "0";
  if (n > 1) return "1";
  return String(n);
}

export async function saveSentrySettings(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("admin.services.actionMessages");
  await requireSettingsAdmin();
  try {
    const dsn = ((formData.get("sentry_dsn") as string | null) ?? "").trim();
    if (dsn && !isValidDsn(dsn)) {
      return { error: t("sentryInvalidDsn"), timestamp: Date.now() };
    }

    const environment =
      ((formData.get("sentry_environment") as string | null) ?? "").trim() ||
      null;
    const tracesSampleRate = clampRate(
      formData.get("sentry_traces_sample_rate") as string | null,
    );
    const replaysOnErrorSampleRate = clampRate(
      formData.get("sentry_replays_on_error_sample_rate") as string | null,
    );
    const sendDefaultPii =
      formData.get("sentry_send_default_pii") === "true" ? "true" : "false";

    await batchUpdateAppSettings({
      "sentry.dsn": dsn || null,
      "sentry.environment": environment,
      "sentry.traces_sample_rate": tracesSampleRate,
      "sentry.replays_on_error_sample_rate": replaysOnErrorSampleRate,
      "sentry.send_default_pii": sendDefaultPii,
    });

    // Invalida la cache della pagina così la prossima nav (o un
    // router.refresh client-side) ricarica i settings freschi. Il form
    // è già controlled-state quindi non si svuota dopo il save, ma
    // questo serve a chi torna sulla rotta dopo aver navigato altrove.
    revalidatePath(await getAdminPath("services-sentry"));

    return { success: t("sentrySaved"), timestamp: Date.now() };
  } catch {
    return { error: t("sentrySaveFailed"), timestamp: Date.now() };
  }
}

export async function testSentry(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("admin.services.actionMessages");
  await requireSettingsAdmin();

  const dsn = ((formData.get("sentry_dsn") as string | null) ?? "").trim();
  if (!dsn) {
    return { error: t("sentryTestDsnRequired"), timestamp: Date.now() };
  }

  const result = await testSentryConnection({ dsn });

  if (!result.ok) {
    const messages: Record<typeof result.reason, string> = {
      invalid_dsn_format: t("sentryTestInvalidDsn"),
      dsn_required: t("sentryTestDsnRequired"),
      dsn_unreachable: t("sentryTestDsnUnreachable"),
      dsn_unauthorized: t("sentryTestDsnUnauthorized"),
      dsn_unknown_status: t("sentryTestDsnUnknownStatus", {
        status: result.detail ?? "?",
      }),
      network_error: t("sentryTestNetworkError"),
    };
    return { error: messages[result.reason], timestamp: Date.now() };
  }

  return { success: t("sentryTestOk"), timestamp: Date.now() };
}
