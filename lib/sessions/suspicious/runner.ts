// lib/sessions/suspicious/runner.ts
//
// Detection + persist orchestrator per i suspicious-session alerts.
//
// CHANGED 2026-05-14: l'email digest NON è più gestito da qui. Il
// runner si limita a detect + persist su `sessionAlerts` + popolare
// `admin_notifications` con `type=session_suspicious` (metadata
// contiene lo snapshot del DigestAlert). Il dispatcher email generico
// (`lib/notifications/email-channel/dispatcher.ts`) prende da lì,
// rispetta lo schedule per source, e invia.

import "server-only";
import { db } from "@/lib/db/drizzle";
import {
  adminNotifications,
  sessionAlerts,
} from "@/lib/db/schema";
import { and, asc, inArray, isNull } from "drizzle-orm";
import {
  type AlertsConfig,
  getAlertsConfig,
} from "./config";
import { runAllDetectors } from "./detectors";
import { meetsThreshold } from "./types";

export type RunnerResult = {
  detected: number;
  inserted: number;
  /** Quante notifiche admin emesse in admin_notifications da questo run. */
  notified: number;
  dryRun: boolean;
};

// ---------------------------------------------------------------------------
// Persist alerts
// ---------------------------------------------------------------------------

/** Inserts candidates into `session_alerts`, idempotent on `dedup_key`. */
async function persistCandidates(
  config: AlertsConfig,
  candidates: Awaited<ReturnType<typeof runAllDetectors>>,
): Promise<{ insertedIds: number[] }> {
  if (candidates.length === 0) return { insertedIds: [] };

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

  // Below-threshold acknowledged silently per non riempire la queue admin.
  // Threshold ora vive in `config.sources.sessions.severityThreshold`.
  const threshold = config.sources.sessions.severityThreshold;
  const belowThreshold = inserted.filter(
    (r) => !meetsThreshold(r.severity as never, threshold),
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
// Bridge: sessionAlerts → admin_notifications
// ---------------------------------------------------------------------------

const REASON_TITLE: Record<string, string> = {
  multiple_ips: "Multiple IPs for one user",
  concurrent_devices: "Many concurrent devices",
  burst_creation: "Burst of new sessions",
  bot_user_agent: "Bot / scraper User-Agent",
  long_idle_resurrect: "Old session reactivated after long idle",
  failed_then_success: "Successful login after failed-attempt burst",
  sensitive_action_new_ip: "Sensitive action from a new IP",
  new_subnet: "Login from a never-seen subnet",
  ua_churn: "Many different user-agents in short window",
  cross_user_campaign: "Same IP attacking multiple users",
  off_baseline_hours: "Login outside the user's typical hours",
  admin_off_hours: "Admin login outside business hours",
  trusted_device_from_fresh_session:
    "Trusted device added right after fresh session",
};

/**
 * Crea (o aggiorna) le righe `admin_notifications` di tipo
 * `session_suspicious` per i nuovi `sessionAlerts` sopra soglia. Il
 * `metadata.snapshot` contiene il payload completo del DigestAlert
 * così l'email-channel renderer non deve fare join al rendering.
 *
 * dedupKey deriva dal sessionAlerts.dedupKey (1:1 con lo stesso alert).
 */
async function bridgeToAdminNotifications(
  config: AlertsConfig,
  alertIds: number[],
): Promise<{ notified: number }> {
  if (alertIds.length === 0) return { notified: 0 };
  const threshold = config.sources.sessions.severityThreshold;

  // Pull dei record completi + dedupKey originale dalla tabella sessionAlerts
  const rows = await db
    .select({
      id: sessionAlerts.id,
      reason: sessionAlerts.reason,
      severity: sessionAlerts.severity,
      createdAt: sessionAlerts.createdAt,
      userId: sessionAlerts.userId,
      sessionId: sessionAlerts.sessionId,
      details: sessionAlerts.details,
      dedupKey: sessionAlerts.dedupKey,
      acknowledgedAt: sessionAlerts.acknowledgedAt,
    })
    .from(sessionAlerts)
    .where(
      and(
        inArray(sessionAlerts.id, alertIds),
        isNull(sessionAlerts.acknowledgedAt), // already-acked = sotto-soglia, skip
      ),
    )
    .orderBy(asc(sessionAlerts.createdAt));

  if (rows.length === 0) return { notified: 0 };

  let notified = 0;
  for (const a of rows) {
    if (!meetsThreshold(a.severity as never, threshold)) continue;
    const title = REASON_TITLE[a.reason] ?? a.reason;
    const dedupKey = `session_suspicious:${a.dedupKey}`;
    try {
      await db
        .insert(adminNotifications)
        .values({
          type: "session_suspicious",
          severity: a.severity,
          title,
          body: null,
          link: null,
          dedupKey,
          requiredPermission: "admin:access",
          metadata: {
            snapshot: {
              id: a.id,
              reason: a.reason,
              severity: a.severity,
              createdAt: a.createdAt.toISOString(),
              userId: a.userId,
              sessionId: a.sessionId,
              details: a.details ?? {},
            },
          },
        })
        .onConflictDoNothing({ target: adminNotifications.dedupKey });
      notified++;
    } catch (err) {
      console.error("[suspicious/runner] admin_notifications upsert failed:", err);
    }
  }
  return { notified };
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

/**
 * Single end-to-end pass. Detection + persist + bridge ad
 * admin_notifications. Idempotente: safe per cron, "run now" admin, test.
 * L'email send è delegato al dispatcher email generico.
 */
export async function runSuspiciousDetection(): Promise<RunnerResult> {
  const config = await getAlertsConfig();
  const now = new Date();

  const candidates = await runAllDetectors(config, now);
  const { insertedIds } = await persistCandidates(config, candidates);

  if (config.dryRun) {
    return {
      detected: candidates.length,
      inserted: insertedIds.length,
      notified: 0,
      dryRun: true,
    };
  }

  const { notified } = await bridgeToAdminNotifications(config, insertedIds);
  void now;

  return {
    detected: candidates.length,
    inserted: insertedIds.length,
    notified,
    dryRun: false,
  };
}
