// lib/sessions/suspicious/runner.ts
//
// End-to-end orchestrator: load config → detect → persist (idempotent) →
// (optionally) email digest → return a summary for telemetry.
//
// Email throttling: based on `config.schedule` and the timestamp stored in
// `app_settings.notifications.alerts_last_digest_at`. The cron route can
// safely tick every 15 min — the runner won't email more often than the
// schedule permits.

import "server-only";
import { db } from "@/lib/db/drizzle";
import { sessionAlerts, users } from "@/lib/db/schema";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  type AlertsConfig,
  getAlertsConfig,
  getLastDigestAt,
  setLastDigestAt,
} from "./config";
import { runAllDetectors } from "./detectors";
import { sendSuspiciousAlertsDigest } from "@/lib/email/templates/admin-suspicious-alerts";
import { meetsThreshold } from "./types";
import { permissions, rolePermissions, roles } from "@/lib/db/schema";

export type RunnerResult = {
  detected: number;
  inserted: number;
  emailedCount: number;
  emailSent: boolean;
  emailReason: string | null;
  dryRun: boolean;
};

// ---------------------------------------------------------------------------
// Persist alerts
// ---------------------------------------------------------------------------

/** Inserts candidates into `session_alerts`, idempotent on `dedup_key`. */
async function persistCandidates(
  config: AlertsConfig,
  candidates: ReturnType<typeof Array.prototype.slice> extends never
    ? never
    : Awaited<ReturnType<typeof runAllDetectors>>,
): Promise<{ insertedIds: number[] }> {
  if (candidates.length === 0) return { insertedIds: [] };

  // Bulk insert with ON CONFLICT DO NOTHING. RETURNING gives us only the
  // rows that were actually inserted (PG behaviour with ON CONFLICT).
  const inserted = await db
    .insert(sessionAlerts)
    .values(
      candidates.map((c) => ({
        sessionId: c.sessionId,
        userId: c.userId,
        reason: c.reason,
        severity: c.severity,
        details: c.details,
        dedupKey: c.dedupKey,
      })),
    )
    .onConflictDoNothing({ target: sessionAlerts.dedupKey })
    .returning({ id: sessionAlerts.id, severity: sessionAlerts.severity });

  // Mark below-threshold alerts as silently acknowledged so they don't
  // drag the panel notification or appear in the digest. They stay in the
  // table for audit.
  const belowThreshold = inserted.filter(
    (r) => !meetsThreshold(
      r.severity as AlertsConfig["severityThreshold"],
      config.severityThreshold,
    ),
  );
  if (belowThreshold.length > 0) {
    await db
      .update(sessionAlerts)
      .set({ acknowledgedAt: new Date() })
      .where(
        inArray(
          sessionAlerts.id,
          belowThreshold.map((r) => r.id),
        ),
      );
  }

  return { insertedIds: inserted.map((r) => r.id) };
}

// ---------------------------------------------------------------------------
// Schedule helpers
// ---------------------------------------------------------------------------

function shouldEmailNow(
  schedule: AlertsConfig["schedule"],
  lastSentAt: Date | null,
  now: Date,
): { ok: true } | { ok: false; reason: string } {
  if (schedule === "off") return { ok: false, reason: "schedule=off" };
  if (schedule === "instant") return { ok: true };
  if (!lastSentAt) return { ok: true };

  const elapsedMs = now.getTime() - lastSentAt.getTime();
  if (schedule === "hourly_digest" && elapsedMs < 60 * 60 * 1000) {
    return { ok: false, reason: "hourly_throttle" };
  }
  if (schedule === "daily_digest" && elapsedMs < 24 * 60 * 60 * 1000) {
    return { ok: false, reason: "daily_throttle" };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Recipient resolution
// ---------------------------------------------------------------------------

async function resolveRecipients(config: AlertsConfig): Promise<string[]> {
  const set = new Set<string>(config.recipients.emails);

  if (config.recipients.includeAdminUsers) {
    // Pull email of users with `admin:access` (via role) or super-admin flag.
    const rows = await db
      .select({ email: users.email })
      .from(users)
      .leftJoin(roles, eq(roles.name, users.role))
      .leftJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
      .leftJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
      .where(
        and(
          isNull(users.deletedAt),
          isNull(users.bannedAt),
          sql`(${users.isAdmin} = true OR ${permissions.key} = 'admin:access')`,
        ),
      );
    for (const r of rows) set.add(r.email);
  }

  return [...set];
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

/**
 * Single end-to-end pass. Always idempotent: safe to invoke from cron, an
 * admin "run now" button, or a test.
 */
export async function runSuspiciousDetection(): Promise<RunnerResult> {
  const config = await getAlertsConfig();
  const now = new Date();

  const candidates = await runAllDetectors(config, now);
  const { insertedIds } = await persistCandidates(config, candidates);

  // Pending = inserted in this run AND severity meets threshold AND not
  // already emailed in a previous tick.
  const pendingForEmail =
    insertedIds.length === 0
      ? []
      : await db
          .select({
            id: sessionAlerts.id,
            reason: sessionAlerts.reason,
            severity: sessionAlerts.severity,
            createdAt: sessionAlerts.createdAt,
            details: sessionAlerts.details,
            userId: sessionAlerts.userId,
            sessionId: sessionAlerts.sessionId,
          })
          .from(sessionAlerts)
          .where(
            and(
              inArray(sessionAlerts.id, insertedIds),
              isNull(sessionAlerts.emailSentAt),
              isNull(sessionAlerts.acknowledgedAt),
            ),
          )
          .orderBy(asc(sessionAlerts.createdAt));

  // Dry-run short-circuits AFTER persistence — alerts still get logged so
  // an admin can review them in the panel before flipping the switch.
  if (config.dryRun) {
    return {
      detected: candidates.length,
      inserted: insertedIds.length,
      emailedCount: 0,
      emailSent: false,
      emailReason: "dry_run",
      dryRun: true,
    };
  }

  if (pendingForEmail.length === 0) {
    return {
      detected: candidates.length,
      inserted: insertedIds.length,
      emailedCount: 0,
      emailSent: false,
      emailReason: "no_pending",
      dryRun: false,
    };
  }

  const lastSent = await getLastDigestAt();
  const decision = shouldEmailNow(config.schedule, lastSent, now);
  if (!decision.ok) {
    return {
      detected: candidates.length,
      inserted: insertedIds.length,
      emailedCount: 0,
      emailSent: false,
      emailReason: decision.reason,
      dryRun: false,
    };
  }

  const recipients = await resolveRecipients(config);
  if (recipients.length === 0) {
    return {
      detected: candidates.length,
      inserted: insertedIds.length,
      emailedCount: 0,
      emailSent: false,
      emailReason: "no_recipients",
      dryRun: false,
    };
  }

  try {
    await sendSuspiciousAlertsDigest({
      recipients,
      alerts: pendingForEmail.map((a) => ({
        id: a.id,
        reason: a.reason,
        severity: a.severity,
        createdAt: a.createdAt,
        userId: a.userId,
        sessionId: a.sessionId,
        details: (a.details ?? {}) as Record<string, unknown>,
      })),
      schedule: config.schedule,
    });

    await db
      .update(sessionAlerts)
      .set({ emailSentAt: now })
      .where(
        inArray(
          sessionAlerts.id,
          pendingForEmail.map((a) => a.id),
        ),
      );
    await setLastDigestAt(now);

    return {
      detected: candidates.length,
      inserted: insertedIds.length,
      emailedCount: pendingForEmail.length,
      emailSent: true,
      emailReason: null,
      dryRun: false,
    };
  } catch (err) {
    console.error("[suspicious/runner] email digest failed:", err);
    return {
      detected: candidates.length,
      inserted: insertedIds.length,
      emailedCount: 0,
      emailSent: false,
      emailReason:
        err instanceof Error ? `email_error:${err.message}` : "email_error",
      dryRun: false,
    };
  }
}
