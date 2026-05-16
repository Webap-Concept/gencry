// lib/sessions/suspicious/config-types.ts
//
// Pure types + Zod schemas + defaults for the suspicious-sessions config.
// Zero runtime dependencies on `postgres` / `drizzle` / `server-only` so
// it can be imported from client components (settings form). The DB
// getters/setters live in the sibling `./config.ts`.

import { z } from "zod";

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

// Per-source notification config. Ogni source (sessions, cron, …) ha
// il proprio enabled/schedule/severityThreshold + payload specifico.
// I global recipients/dryRun stanno fuori e si applicano a tutte.

const SessionsRulesSchema = z.object({
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
});

export const SessionsSourceSchema = z.object({
  enabled: z.boolean().default(true),
  schedule: z.enum(SCHEDULES).default("hourly_digest"),
  severityThreshold: z.enum(SEVERITIES).default("warning"),
  rules: SessionsRulesSchema,
});

export const CronSourceSchema = z.object({
  enabled: z.boolean().default(true),
  schedule: z.enum(SCHEDULES).default("hourly_digest"),
  severityThreshold: z.enum(SEVERITIES).default("warning"),
  /** Failures consecutivi sopra cui la severity sale a `critical`. */
  escalateAfterFailures: z.number().int().positive().default(5),
});

export const AlertsConfigSchema = z.object({
  recipients: RecipientsSchema,
  /** When true: detect & log alerts ma niente email send. */
  dryRun: z.boolean(),
  /** Sources di notifiche con la loro config (enabled/schedule/threshold). */
  sources: z.object({
    sessions: SessionsSourceSchema,
    cron: CronSourceSchema,
  }),
});

export type AlertsConfig = z.infer<typeof AlertsConfigSchema>;
export type SessionsSourceConfig = z.infer<typeof SessionsSourceSchema>;
export type CronSourceConfig = z.infer<typeof CronSourceSchema>;

/**
 * Backward-compat parser. Il payload `notifications.alerts_config`
 * salvato prima del 2026-05-14 aveva lo shape:
 *   { recipients, schedule, severityThreshold, dryRun, rules: {...} }
 * Lo migriamo runtime nel nuovo shape `sources.sessions.{...}` senza
 * toccare il DB. Una save successiva persiste il nuovo formato.
 */
export function parseAlertsConfig(raw: unknown): AlertsConfig | null {
  if (raw === null || raw === undefined) return null;
  // Già nel formato nuovo?
  const newAttempt = AlertsConfigSchema.safeParse(raw);
  if (newAttempt.success) return newAttempt.data;

  // Formato legacy?
  if (typeof raw !== "object" || raw === null) return null;
  const legacy = raw as Record<string, unknown>;
  if (!("rules" in legacy)) return null;
  const migrated: unknown = {
    recipients: legacy.recipients,
    dryRun: legacy.dryRun ?? false,
    sources: {
      sessions: {
        enabled: true,
        schedule: legacy.schedule ?? "hourly_digest",
        severityThreshold: legacy.severityThreshold ?? "warning",
        rules: legacy.rules,
      },
      cron: {
        enabled: true,
        schedule: "hourly_digest",
        severityThreshold: "warning",
        escalateAfterFailures: 5,
      },
    },
  };
  const legacyAttempt = AlertsConfigSchema.safeParse(migrated);
  return legacyAttempt.success ? legacyAttempt.data : null;
}

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
  dryRun: false,
  sources: {
    sessions: {
      enabled: true,
      schedule: "hourly_digest",
      severityThreshold: "warning",
      rules: {
        multiple_ips: { enabled: true, severity: "warning", count: 3, windowHours: 24 },
        concurrent_devices: { enabled: true, severity: "warning", count: 5 },
        burst_creation: { enabled: true, severity: "warning", count: 5, windowMinutes: 60 },
        bot_user_agent: { enabled: true, severity: "critical", pattern: DEFAULT_BOT_UA_PATTERN },
        long_idle_resurrect: { enabled: true, severity: "warning", idleDays: 7 },
        failed_then_success: { enabled: true, severity: "critical", failedCount: 5, windowMinutes: 60 },
        sensitive_action_new_ip: {
          enabled: true,
          severity: "critical",
          withinMinutes: 30,
          actions: DEFAULT_SENSITIVE_ACTIONS,
        },
        new_subnet: { enabled: true, severity: "info", lookbackDays: 90 },
        ua_churn: { enabled: true, severity: "warning", count: 3, windowMinutes: 60 },
        cross_user_campaign: { enabled: true, severity: "critical", minUsers: 3, windowMinutes: 60 },
        off_baseline_hours: {
          enabled: true,
          severity: "info",
          minSamples: 10,
          deviationHours: 6,
          lookbackDays: 30,
        },
        admin_off_hours: { enabled: true, severity: "warning", startUtcHour: 6, endUtcHour: 23 },
        trusted_device_from_fresh_session: {
          enabled: true,
          severity: "warning",
          withinMinutes: 10,
        },
      },
    },
    cron: {
      enabled: true,
      schedule: "hourly_digest",
      severityThreshold: "warning",
      escalateAfterFailures: 5,
    },
  },
};
