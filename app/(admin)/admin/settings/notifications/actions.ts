"use server";

import { getAdminPath } from "@/lib/admin-nav";
import { sendSuspiciousAlertsDigest } from "@/lib/email/templates/admin-suspicious-alerts";
import { requireAdminSectionPage } from "@/lib/rbac/guards";
import {
  AlertsConfigSchema,
  DEFAULT_ALERTS_CONFIG,
  getAlertsConfig,
  type AlertsConfig,
  saveAlertsConfig,
  SCHEDULES,
  SEVERITIES,
  SUSPICION_REASONS,
} from "@/lib/sessions/suspicious/config";
import { runSuspiciousDetection } from "@/lib/sessions/suspicious/runner";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";

export type ActionState =
  | {}
  | { success: string; timestamp: number }
  | { error: string; timestamp: number };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function bool(v: FormDataEntryValue | null): boolean {
  return v === "on" || v === "true" || v === "1";
}

function strOr<T extends string>(
  v: FormDataEntryValue | null,
  allowed: readonly T[],
  fallback: T,
): T {
  if (typeof v !== "string") return fallback;
  return (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

function intOr(v: FormDataEntryValue | null, fallback: number): number {
  if (typeof v !== "string") return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function emailListFrom(raw: FormDataEntryValue | null): string[] {
  if (typeof raw !== "string") return [];
  return raw
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Save
// ---------------------------------------------------------------------------

export async function saveNotificationsConfigAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdminSectionPage("admin:settings");

  const defaults = DEFAULT_ALERTS_CONFIG;
  const rules = defaults.rules;

  const next: AlertsConfig = {
    recipients: {
      emails: emailListFrom(formData.get("recipients_emails")),
      includeAdminUsers: bool(formData.get("recipients_include_admin_users")),
    },
    schedule: strOr(formData.get("schedule"), SCHEDULES, defaults.schedule),
    severityThreshold: strOr(
      formData.get("severity_threshold"),
      SEVERITIES,
      defaults.severityThreshold,
    ),
    dryRun: bool(formData.get("dry_run")),
    rules: {
      multiple_ips: {
        enabled: bool(formData.get("rule_multiple_ips_enabled")),
        severity: strOr(
          formData.get("rule_multiple_ips_severity"),
          SEVERITIES,
          rules.multiple_ips.severity,
        ),
        count: intOr(
          formData.get("rule_multiple_ips_count"),
          rules.multiple_ips.count,
        ),
        windowHours: intOr(
          formData.get("rule_multiple_ips_window_hours"),
          rules.multiple_ips.windowHours,
        ),
      },
      concurrent_devices: {
        enabled: bool(formData.get("rule_concurrent_devices_enabled")),
        severity: strOr(
          formData.get("rule_concurrent_devices_severity"),
          SEVERITIES,
          rules.concurrent_devices.severity,
        ),
        count: intOr(
          formData.get("rule_concurrent_devices_count"),
          rules.concurrent_devices.count,
        ),
      },
      burst_creation: {
        enabled: bool(formData.get("rule_burst_creation_enabled")),
        severity: strOr(
          formData.get("rule_burst_creation_severity"),
          SEVERITIES,
          rules.burst_creation.severity,
        ),
        count: intOr(
          formData.get("rule_burst_creation_count"),
          rules.burst_creation.count,
        ),
        windowMinutes: intOr(
          formData.get("rule_burst_creation_window_minutes"),
          rules.burst_creation.windowMinutes,
        ),
      },
      bot_user_agent: {
        enabled: bool(formData.get("rule_bot_user_agent_enabled")),
        severity: strOr(
          formData.get("rule_bot_user_agent_severity"),
          SEVERITIES,
          rules.bot_user_agent.severity,
        ),
        pattern:
          (formData.get("rule_bot_user_agent_pattern") as string)?.trim() ||
          rules.bot_user_agent.pattern,
      },
      long_idle_resurrect: {
        enabled: bool(formData.get("rule_long_idle_resurrect_enabled")),
        severity: strOr(
          formData.get("rule_long_idle_resurrect_severity"),
          SEVERITIES,
          rules.long_idle_resurrect.severity,
        ),
        idleDays: intOr(
          formData.get("rule_long_idle_resurrect_idle_days"),
          rules.long_idle_resurrect.idleDays,
        ),
      },
      failed_then_success: {
        enabled: bool(formData.get("rule_failed_then_success_enabled")),
        severity: strOr(
          formData.get("rule_failed_then_success_severity"),
          SEVERITIES,
          rules.failed_then_success.severity,
        ),
        failedCount: intOr(
          formData.get("rule_failed_then_success_failed_count"),
          rules.failed_then_success.failedCount,
        ),
        windowMinutes: intOr(
          formData.get("rule_failed_then_success_window_minutes"),
          rules.failed_then_success.windowMinutes,
        ),
      },
      sensitive_action_new_ip: {
        enabled: bool(formData.get("rule_sensitive_action_new_ip_enabled")),
        severity: strOr(
          formData.get("rule_sensitive_action_new_ip_severity"),
          SEVERITIES,
          rules.sensitive_action_new_ip.severity,
        ),
        withinMinutes: intOr(
          formData.get("rule_sensitive_action_new_ip_within_minutes"),
          rules.sensitive_action_new_ip.withinMinutes,
        ),
        actions:
          emailListFrom(formData.get("rule_sensitive_action_new_ip_actions"))
            .length > 0
            ? emailListFrom(
                formData.get("rule_sensitive_action_new_ip_actions"),
              )
            : rules.sensitive_action_new_ip.actions,
      },
      new_subnet: {
        enabled: bool(formData.get("rule_new_subnet_enabled")),
        severity: strOr(
          formData.get("rule_new_subnet_severity"),
          SEVERITIES,
          rules.new_subnet.severity,
        ),
        lookbackDays: intOr(
          formData.get("rule_new_subnet_lookback_days"),
          rules.new_subnet.lookbackDays,
        ),
      },
      ua_churn: {
        enabled: bool(formData.get("rule_ua_churn_enabled")),
        severity: strOr(
          formData.get("rule_ua_churn_severity"),
          SEVERITIES,
          rules.ua_churn.severity,
        ),
        count: intOr(
          formData.get("rule_ua_churn_count"),
          rules.ua_churn.count,
        ),
        windowMinutes: intOr(
          formData.get("rule_ua_churn_window_minutes"),
          rules.ua_churn.windowMinutes,
        ),
      },
      cross_user_campaign: {
        enabled: bool(formData.get("rule_cross_user_campaign_enabled")),
        severity: strOr(
          formData.get("rule_cross_user_campaign_severity"),
          SEVERITIES,
          rules.cross_user_campaign.severity,
        ),
        minUsers: intOr(
          formData.get("rule_cross_user_campaign_min_users"),
          rules.cross_user_campaign.minUsers,
        ),
        windowMinutes: intOr(
          formData.get("rule_cross_user_campaign_window_minutes"),
          rules.cross_user_campaign.windowMinutes,
        ),
      },
      off_baseline_hours: {
        enabled: bool(formData.get("rule_off_baseline_hours_enabled")),
        severity: strOr(
          formData.get("rule_off_baseline_hours_severity"),
          SEVERITIES,
          rules.off_baseline_hours.severity,
        ),
        minSamples: intOr(
          formData.get("rule_off_baseline_hours_min_samples"),
          rules.off_baseline_hours.minSamples,
        ),
        deviationHours: intOr(
          formData.get("rule_off_baseline_hours_deviation_hours"),
          rules.off_baseline_hours.deviationHours,
        ),
        lookbackDays: intOr(
          formData.get("rule_off_baseline_hours_lookback_days"),
          rules.off_baseline_hours.lookbackDays,
        ),
      },
      admin_off_hours: {
        enabled: bool(formData.get("rule_admin_off_hours_enabled")),
        severity: strOr(
          formData.get("rule_admin_off_hours_severity"),
          SEVERITIES,
          rules.admin_off_hours.severity,
        ),
        startUtcHour: intOr(
          formData.get("rule_admin_off_hours_start_utc_hour"),
          rules.admin_off_hours.startUtcHour,
        ),
        endUtcHour: intOr(
          formData.get("rule_admin_off_hours_end_utc_hour"),
          rules.admin_off_hours.endUtcHour,
        ),
      },
      trusted_device_from_fresh_session: {
        enabled: bool(
          formData.get("rule_trusted_device_from_fresh_session_enabled"),
        ),
        severity: strOr(
          formData.get("rule_trusted_device_from_fresh_session_severity"),
          SEVERITIES,
          rules.trusted_device_from_fresh_session.severity,
        ),
        withinMinutes: intOr(
          formData.get("rule_trusted_device_from_fresh_session_within_minutes"),
          rules.trusted_device_from_fresh_session.withinMinutes,
        ),
      },
    },
  };

  const t = await getTranslations("admin.settings.actionMessages");
  const parsed = AlertsConfigSchema.safeParse(next);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".")} — ${i.message}`)
      .join("; ");
    return {
      error: t("notificationsConfigInvalid", { issues }),
      timestamp: Date.now(),
    };
  }

  try {
    await saveAlertsConfig(parsed.data);
    revalidatePath(getAdminPath("settings-notifications"));
    return {
      success: t("notificationsConfigSaved"),
      timestamp: Date.now(),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : t("notificationsConfigSaveFailed");
    return { error: message, timestamp: Date.now() };
  }
}

// ---------------------------------------------------------------------------
// Manual triggers
// ---------------------------------------------------------------------------

export async function runDetectionNowAction(
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  await requireAdminSectionPage("admin:settings");
  const t = await getTranslations("admin.settings.actionMessages");
  try {
    const result = await runSuspiciousDetection();
    return {
      success: t("notificationsRunComplete", {
        detected: result.detected,
        inserted: result.inserted,
        emailed: result.emailedCount,
        dryRun: result.dryRun ? "true" : "false",
      }),
      timestamp: Date.now(),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : t("notificationsRunFailed");
    return { error: message, timestamp: Date.now() };
  }
}

export async function sendTestDigestAction(
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  await requireAdminSectionPage("admin:settings");
  const t = await getTranslations("admin.settings.actionMessages");
  try {
    const config = await getAlertsConfig();
    const recipients = config.recipients.emails;
    if (recipients.length === 0) {
      return {
        error: t("notificationsTestRecipientRequired"),
        timestamp: Date.now(),
      };
    }
    await sendSuspiciousAlertsDigest({
      recipients,
      schedule: "test",
      alerts: [
        {
          id: 0,
          reason: SUSPICION_REASONS[0],
          severity: "critical",
          createdAt: new Date(),
          userId: null,
          sessionId: null,
          details: {
            note: "This is a TEST digest — no real alert was raised.",
          },
        },
      ],
    });
    return {
      success: t("notificationsTestDigestSent", { count: recipients.length }),
      timestamp: Date.now(),
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : t("notificationsTestDigestFailed");
    return { error: message, timestamp: Date.now() };
  }
}
