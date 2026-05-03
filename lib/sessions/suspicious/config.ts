// lib/sessions/suspicious/config.ts
//
// Server-only DB persistence for the suspicious-sessions config. Pure
// types / Zod schemas / defaults live in `./config-types.ts` so client
// components (e.g. the settings form) can import them without dragging
// in `postgres` / `drizzle`.
//
// The blob is stored as JSON in `app_settings` under
// `notifications.alerts_config`. Validated on read so a malformed row
// never crashes the cron — we fall back to defaults instead.

import "server-only";
import { getAppSettings, updateAppSetting } from "@/lib/db/settings-queries";
import {
  AlertsConfigSchema,
  DEFAULT_ALERTS_CONFIG,
  type AlertsConfig,
} from "./config-types";

// Re-export the public surface so existing imports of `./config` keep working.
export {
  AlertsConfigSchema,
  DEFAULT_ALERTS_CONFIG,
  DEFAULT_BOT_UA_PATTERN,
  DEFAULT_SENSITIVE_ACTIONS,
  RuleSchemas,
  SCHEDULES,
  SEVERITIES,
  SUSPICION_REASONS,
  type AlertSeverity,
  type AlertsConfig,
  type DigestSchedule,
  type SuspicionReason,
} from "./config-types";

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
