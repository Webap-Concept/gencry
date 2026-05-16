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
  parseAlertsConfig,
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
  parseAlertsConfig,
  type AlertSeverity,
  type AlertsConfig,
  type CronSourceConfig,
  type DigestSchedule,
  type SessionsSourceConfig,
  type SuspicionReason,
} from "./config-types";

// ---------------------------------------------------------------------------
// Get / Set
// ---------------------------------------------------------------------------

/**
 * Loads + validates the alerts config. Backward-compat: il payload
 * legacy (`{ recipients, schedule, severityThreshold, dryRun, rules }`,
 * salvato prima del refactor 2026-05-14) viene migrato runtime al
 * nuovo shape `{ recipients, dryRun, sources.sessions.{...} }` senza
 * toccare il DB. Una save successiva persiste il formato canonico.
 *
 * Su parse failure logga un warning e ritorna i defaults — never
 * throws, così il cron resta resiliente a payload malformati.
 */
export async function getAlertsConfig(): Promise<AlertsConfig> {
  const settings = await getAppSettings();
  const raw = settings["notifications.alerts_config"];
  if (!raw) return DEFAULT_ALERTS_CONFIG;
  try {
    const parsed = JSON.parse(raw);
    const result = parseAlertsConfig(parsed);
    if (result) return result;
    console.warn(
      "[alerts/config] invalid config in DB (legacy + new shape failed), using defaults",
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
