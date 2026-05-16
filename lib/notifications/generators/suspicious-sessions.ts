// Generator: panel notification for unacknowledged suspicious-session alerts.
//
// We don't emit one notification per alert — that would spam the bell.
// Instead, a single rolling-summary candidate per severity bucket. The
// dispatcher's reconciliation logic auto-resolves when the bucket empties
// (admin acknowledges all matching alerts).

import { db } from "@/lib/db/drizzle";
import { buildAdminPath } from "@/lib/admin-paths";
import { isUndefinedTableError } from "@/lib/db/errors";
import { sessionAlerts } from "@/lib/db/schema";
import { count, isNull } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { meetsThreshold } from "@/lib/sessions/suspicious/types";
import { getAlertsConfig } from "@/lib/sessions/suspicious/config";
import type {
  NotificationCandidate,
  NotificationGenerator,
  NotificationSeverity,
} from "../types";

export const SUSPICIOUS_SESSIONS_TYPE = "suspicious_sessions";

/** Tag per `revalidateTag()` quando l'admin ack-a un alert e vuole vedere
 * il count aggiornato subito. Senza revalidate la cache scade comunque
 * ogni 60s. */
export const UNACKED_ALERTS_TAG = "unacked-alerts";

/** Maps our alert severity to the notifications-framework severity. */
const SEVERITY_MAP: Record<string, NotificationSeverity> = {
  critical: "critical",
  warning: "warning",
  info: "info",
};

export const suspiciousSessionsGenerator: NotificationGenerator = {
  type: SUSPICIOUS_SESSIONS_TYPE,
  requiredPermission: "admin:sessions",
  run: async () => {
    const config = await getAlertsConfig();

    // Count unacknowledged alerts per severity. Acknowledged alerts are
    // dropped: the admin already saw them. If the table doesn't exist yet
    // (migration not applied) silently emit zero candidates so the rest
    // of the dispatcher run keeps working.
    let rows: Array<{ severity: string; c: number }>;
    try {
      rows = await db
        .select({
          severity: sessionAlerts.severity,
          c: count(sessionAlerts.id),
        })
        .from(sessionAlerts)
        .where(isNull(sessionAlerts.acknowledgedAt))
        .groupBy(sessionAlerts.severity);
    } catch (err) {
      if (isUndefinedTableError(err, "session_alerts")) {
        console.warn(
          "[suspicious-sessions] session_alerts table missing — run the SQL migration",
        );
        return [];
      }
      throw err;
    }

    const counts: Record<string, number> = {};
    for (const r of rows) counts[r.severity] = Number(r.c);

    // Pre-risolvo il base admin path per costruire i link runtime con
    // lo slug pubblico configurato.
    const sessionsBase = await buildAdminPath("/access/sessions");

    const out: NotificationCandidate[] = [];
    for (const sev of ["critical", "warning", "info"] as const) {
      const n = counts[sev] ?? 0;
      if (n === 0) continue;
      if (!meetsThreshold(sev, config.sources.sessions.severityThreshold)) continue;

      const title =
        sev === "critical"
          ? `${n} critical suspicious ${n === 1 ? "session" : "sessions"}`
          : sev === "warning"
            ? `${n} suspicious session ${n === 1 ? "warning" : "warnings"}`
            : `${n} suspicious session ${n === 1 ? "notice" : "notices"}`;

      out.push({
        type: SUSPICIOUS_SESSIONS_TYPE,
        severity: SEVERITY_MAP[sev] ?? "warning",
        title,
        body:
          sev === "critical"
            ? "Likely takeover signals detected. Review and revoke if needed."
            : "Unusual session patterns detected. Review when possible.",
        link: `${sessionsBase}?tab=alerts&severity=${sev}`,
        // Stable per-severity dedup so the dispatcher updates the count in
        // place instead of inserting new rows on every cron tick.
        dedupKey: `suspicious_sessions:${sev}`,
        metadata: { count: n, severity: sev },
      });
    }

    return out;
  },
};

/** Counts unacknowledged alerts (used by the sessions admin page badge).
 *  Returns zeros if `session_alerts` doesn't exist yet (migration not
 *  applied) — the page should keep rendering.
 *
 *  Cache 60s con tag UNACKED_ALERTS_TAG. Per vedere il count fresco
 *  subito dopo un ack, l'azione di ack deve chiamare
 *  `revalidateTag(UNACKED_ALERTS_TAG)`. Senza revalidate l'admin vede
 *  comunque il numero corretto entro 60s. */
const fetchCount = async () => {
  const result = { total: 0, critical: 0, warning: 0, info: 0 };
  let rows: Array<{ severity: string; c: number }>;
  try {
    rows = await db
      .select({
        severity: sessionAlerts.severity,
        c: count(sessionAlerts.id),
      })
      .from(sessionAlerts)
      .where(isNull(sessionAlerts.acknowledgedAt))
      .groupBy(sessionAlerts.severity);
  } catch (err) {
    if (isUndefinedTableError(err, "session_alerts")) return result;
    throw err;
  }
  for (const r of rows) {
    const n = Number(r.c);
    result.total += n;
    if (r.severity === "critical") result.critical = n;
    else if (r.severity === "warning") result.warning = n;
    else if (r.severity === "info") result.info = n;
  }
  return result;
};

const fetchCountCached = unstable_cache(fetchCount, ["unacked-alerts-count"], {
  revalidate: 60,
  tags: [UNACKED_ALERTS_TAG],
});

export async function countUnacknowledgedAlerts(): Promise<{
  total: number;
  critical: number;
  warning: number;
  info: number;
}> {
  return fetchCountCached();
}
