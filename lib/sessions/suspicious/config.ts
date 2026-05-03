// lib/sessions/suspicious/config.ts
//
// Suspicious-sessions detection config. Single source of truth for which
// heuristics are enabled, their thresholds, and how alerts are routed
// (email recipients + schedule + dry-run flag).
//
// Persisted as a JSON blob in `app_settings` under the key
// `notifications.alerts_config`. Validated via Zod on read so a malformed
// row never crashes the cron — we fall back to defaults instead.

import { z } from "zod";
import { getAppSettings, updateAppSetting } from "@/lib/db/settings-queries";
import "server-only";

// ---------------------------------------------------------------------------
// Heuristic ids
// ---------------------------------------------------------------------------

export const SUSPICION_REASONS = [
  "multiple_ips",
  "concurrent_devices",
  "burst_creation",
  "bot_user_agent",
  "long_idle_resurrect",
  "failed_then_success",
  "sensitive_action_new_ip",
  "new_subnet",
  "ua_churn",
  "cross_user_campaign",
  "off_baseline_hours",
  "admin_off_hours",
  "trusted_device_from_fresh_session",
] as const;

export type SuspicionReason = (typeof SUSPICION_REASONS)[number];

export const SEVERITIES = ["info", "warning", "critical"] as const;
export type AlertSeverity = (typeof SEVERITIES)[number];

export const SCHEDULES = [
  "instant",
  "hourly_digest",
  "daily_digest",
  "off",
] as const;
export type DigestSchedule = (typeof SCHEDULES)[number];

// ---------------------------------------------------------------------------
// Per-rule schemas
// ---------------------------------------------------------------------------

const ruleBase = {
  enabled: z.boolean(),
  severity: z.enum(SEVERITIES),
};

const positiveInt = z.number().int().positive();
const nonNegInt = z.number().int().min(0);

export const RuleSchemas = {
  multiple_ips: z.object({
    ...ruleBase,
    count: positiveInt,
    windowHours: positiveInt,
  }),
  concurrent_devices: z.object({
    ...ruleBase,
    count: positiveInt,
  }),
  burst_creation: z.object({
    ...ruleBase,
    count: positiveInt,
    windowMinutes: positiveInt,
  }),
  bot_user_agent: z.object({
    ...ruleBase,
    /** Pipe-joined regex alternates, e.g. `curl|wget|python-requests`. */
    pattern: z.string().min(1),
  }),
  long_idle_resurrect: z.object({
    ...ruleBase,
    idleDays: positiveInt,
  }),
  failed_then_success: z.object({
    ...ruleBase,
    failedCount: positiveInt,
    windowMinutes: positiveInt,
  }),
  sensitive_action_new_ip: z.object({
    ...ruleBase,
    withinMinutes: positiveInt,
    /** ActivityType values to consider "sensitive". */
    actions: z.array(z.string()).min(1),
  }),
  new_subnet: z.object({
    ...ruleBase,
    lookbackDays: positiveInt,
  }),
  ua_churn: z.object({
    ...ruleBase,
    count: positiveInt,
    windowMinutes: positiveInt,
  }),
  cross_user_campaign: z.object({
    ...ruleBase,
    minUsers: positiveInt,
    windowMinutes: positiveInt,
  }),
  off_baseline_hours: z.object({
    ...ruleBase,
    /** Min historical sessions required before we trust the baseline. */
    minSamples: positiveInt,
    /** How many hours must the new session deviate from the baseline window. */
    deviationHours: positiveInt,
    /** Days of history to compute the baseline from. */
    lookbackDays: positiveInt,
  }),
  admin_off_hours: z.object({
    ...ruleBase,
    /** UTC, 0..23. The "allowed" window is [startUtc, endUtc). */
    startUtcHour: nonNegInt.max(23),
    endUtcHour: positiveInt.max(24),
  }),
  trusted_device_from_fresh_session: z.object({
    ...ruleBase,
    withinMinutes: positiveInt,
  }),
} as const;

// ---------------------------------------------------------------------------
// Top-level config
// ---------------------------------------------------------------------------

const RecipientsSchema = z.object({
  emails: z.array(z.string().email()).default([]),
  includeAdminUsers: z.boolean().default(false),
});

export const AlertsConfigSchema = z.object({
  recipients: RecipientsSchema,
  schedule: z.enum(SCHEDULES),
  /** Don't alert below this severity in the digest / panel. */
  severityThreshold: z.enum(SEVERITIES),
  /** When true: detect & log alerts, but don't send email or panel notify. */
  dryRun: z.boolean(),
  rules: z.object({
    multiple_ips: RuleSchemas.multiple_ips,
    concurrent_devices: RuleSchemas.concurrent_devices,
    burst_creation: RuleSchemas.burst_creation,
    bot_user_agent: RuleSchemas.bot_user_agent,
    long_idle_resurrect: RuleSchemas.long_idle_resurrect,
    failed_then_success: RuleSchemas.failed_then_success,
    sensitive_action_new_ip: RuleSchemas.sensitive_action_new_ip,
    new_subnet: RuleSchemas.new_subnet,
    ua_churn: RuleSchemas.ua_churn,
    cross_user_campaign: RuleSchemas.cross_user_campaign,
    off_baseline_hours: RuleSchemas.off_baseline_hours,
    admin_off_hours: RuleSchemas.admin_off_hours,
    trusted_device_from_fresh_session: RuleSchemas.trusted_device_from_fresh_session,
  }),
});

export type AlertsConfig = z.infer<typeof AlertsConfigSchema>;

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_BOT_UA_PATTERN =
  "curl|wget|python-requests|HeadlessChrome|Puppeteer|PhantomJS|bot|crawler|spider|scraper|httpclient|okhttp|libwww|axios|node-fetch";

/**
 * Sensitive activity types. Strings match `ActivityType` enum values in
 * `lib/db/schema.ts` — kept as strings here to avoid pulling the heavy
 * schema into client bundles.
 */
export const DEFAULT_SENSITIVE_ACTIONS = [
  "DELETE_ACCOUNT",
  "EMAIL_CHANGED",
  "UPDATE_PASSWORD",
  "PASSWORD_RESET_COMPLETED",
  "ADMIN_CHANGE_ROLE",
];

export const DEFAULT_ALERTS_CONFIG: AlertsConfig = {
  recipients: { emails: [], includeAdminUsers: true },
  schedule: "hourly_digest",
  severityThreshold: "warning",
  dryRun: false,
  rules: {
    multiple_ips: {
      enabled: true,
      severity: "warning",
      count: 3,
      windowHours: 24,
    },
    concurrent_devices: { enabled: true, severity: "warning", count: 5 },
    burst_creation: {
      enabled: true,
      severity: "warning",
      count: 5,
      windowMinutes: 60,
    },
    bot_user_agent: {
      enabled: true,
      severity: "critical",
      pattern: DEFAULT_BOT_UA_PATTERN,
    },
    long_idle_resurrect: {
      enabled: true,
      severity: "warning",
      idleDays: 7,
    },
    failed_then_success: {
      enabled: true,
      severity: "critical",
      failedCount: 5,
      windowMinutes: 60,
    },
    sensitive_action_new_ip: {
      enabled: true,
      severity: "critical",
      withinMinutes: 30,
      actions: DEFAULT_SENSITIVE_ACTIONS,
    },
    new_subnet: { enabled: true, severity: "info", lookbackDays: 90 },
    ua_churn: {
      enabled: true,
      severity: "warning",
      count: 3,
      windowMinutes: 60,
    },
    cross_user_campaign: {
      enabled: true,
      severity: "critical",
      minUsers: 3,
      windowMinutes: 60,
    },
    off_baseline_hours: {
      enabled: true,
      severity: "info",
      minSamples: 10,
      deviationHours: 6,
      lookbackDays: 30,
    },
    admin_off_hours: {
      enabled: true,
      severity: "warning",
      startUtcHour: 6,
      endUtcHour: 23,
    },
    trusted_device_from_fresh_session: {
      enabled: true,
      severity: "warning",
      withinMinutes: 10,
    },
  },
};

// ---------------------------------------------------------------------------
// Get / Set
// ---------------------------------------------------------------------------

/**
 * Loads + validates the alerts config. On parse failure logs a warning
 * and returns the defaults — never throws, so the cron stays resilient
 * to malformed admin input or a partial migration.
 */
export async function getAlertsConfig(): Promise<AlertsConfig> {
  const settings = await getAppSettings();
  const raw = settings["notifications.alerts_config"];
  if (!raw) return DEFAULT_ALERTS_CONFIG;
  try {
    const parsed = JSON.parse(raw);
    const result = AlertsConfigSchema.safeParse(parsed);
    if (result.success) return result.data;
    console.warn(
      "[alerts/config] invalid config in DB, using defaults:",
      result.error.issues,
    );
    return DEFAULT_ALERTS_CONFIG;
  } catch (e) {
    console.warn("[alerts/config] could not parse config JSON:", e);
    return DEFAULT_ALERTS_CONFIG;
  }
}

export async function saveAlertsConfig(config: AlertsConfig): Promise<void> {
  const validated = AlertsConfigSchema.parse(config);
  await updateAppSetting(
    "notifications.alerts_config",
    JSON.stringify(validated),
  );
}

export async function getLastDigestAt(): Promise<Date | null> {
  const settings = await getAppSettings();
  const raw = settings["notifications.alerts_last_digest_at"];
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

export async function setLastDigestAt(d: Date): Promise<void> {
  await updateAppSetting(
    "notifications.alerts_last_digest_at",
    d.toISOString(),
  );
}
