// lib/notifications/email-channel/dispatcher.ts
//
// Dispatcher email generico per le admin_notifications. Per ogni source
// abilitata in `alertsConfig.sources`, sceglie cosa inviare in base allo
// schedule (instant / hourly_digest / daily_digest / off) e al severity
// threshold, raggruppa le notifiche per type, chiama il renderer
// corrispondente e fa sendEmail. Mark `email_sent_at = NOW()` su admin
// _notifications così la notifica non viene re-inviata al prossimo run.
//
// Risorsa di throttle: la stessa colonna `email_sent_at`. Last-sent per
// source = MAX(email_sent_at) WHERE type IN [...types-of-source].
//
// Auto-resolve dei recipients: emails configurate +
// (opzionale) tutti gli utenti con permission `admin:access`.
import "server-only";

import { and, asc, eq, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import {
  adminNotifications,
  permissions,
  rolePermissions,
  roles,
  users,
} from "@/lib/db/schema";
import { sendEmail } from "@/lib/email/resend";
import { runGenerators } from "@/lib/notifications/dispatcher";
import { getAlertsConfig } from "@/lib/sessions/suspicious/config";
import type {
  AlertSeverity,
  DigestSchedule,
} from "@/lib/sessions/suspicious/config-types";
import { findRendererForType, RENDERERS } from "./registry";
import type { AlertsSourceKey } from "./types";

const SEVERITY_ORDER: Record<AlertSeverity, number> = {
  info: 0,
  warning: 1,
  critical: 2,
};

function meetsThreshold(severity: string, threshold: AlertSeverity): boolean {
  const s = SEVERITY_ORDER[severity as AlertSeverity];
  const t = SEVERITY_ORDER[threshold];
  if (s === undefined || t === undefined) return false;
  return s >= t;
}

function scheduleAllowsSend(
  schedule: DigestSchedule,
  lastSentAt: Date | null,
  now: Date,
): boolean {
  if (schedule === "off") return false;
  if (schedule === "instant") return true;
  if (!lastSentAt) return true; // mai inviata → manda
  const diffMs = now.getTime() - lastSentAt.getTime();
  if (schedule === "hourly_digest") return diffMs >= 60 * 60 * 1000;
  if (schedule === "daily_digest") return diffMs >= 24 * 60 * 60 * 1000;
  return false;
}

async function resolveRecipientEmails(
  configured: string[],
  includeAdminUsers: boolean,
): Promise<string[]> {
  const set = new Set<string>();
  for (const e of configured) {
    const trimmed = e.trim().toLowerCase();
    if (trimmed) set.add(trimmed);
  }
  if (includeAdminUsers) {
    // Tutti gli utenti che hanno la permission "admin:access" via role.
    const rows = await db
      .selectDistinct({ email: users.email })
      .from(users)
      .innerJoin(rolePermissions, eq(rolePermissions.roleId, sql`(SELECT id FROM roles WHERE name = ${users.role})`))
      .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
      .where(
        and(
          eq(permissions.key, "admin:access"),
          isNull(users.deletedAt),
          isNull(users.bannedAt),
        ),
      );
    for (const r of rows) {
      if (r.email) set.add(r.email.toLowerCase());
    }
  }
  return [...set];
}

async function getLastSentForTypes(types: string[]): Promise<Date | null> {
  if (types.length === 0) return null;
  const rows = await db
    .select({ max: sql<Date | null>`MAX(${adminNotifications.emailSentAt})` })
    .from(adminNotifications)
    .where(inArray(adminNotifications.type, types));
  return rows[0]?.max ?? null;
}

export type EmailDispatchResult = {
  ok: boolean;
  sources: Array<{
    source: AlertsSourceKey;
    sent: boolean;
    items: number;
    reason?: string;
    error?: string;
  }>;
};

export async function runEmailDispatch(): Promise<EmailDispatchResult> {
  // 1. Run generators per rifrescare admin_notifications
  await runGenerators();

  const cfg = await getAlertsConfig();
  const result: EmailDispatchResult = { ok: true, sources: [] };

  if (cfg.dryRun) {
    return { ok: true, sources: [{ source: "sessions", sent: false, items: 0, reason: "dryRun" }] };
  }

  const recipients = await resolveRecipientEmails(
    cfg.recipients.emails,
    cfg.recipients.includeAdminUsers,
  );
  if (recipients.length === 0) {
    return { ok: true, sources: [{ source: "sessions", sent: false, items: 0, reason: "no_recipients" }] };
  }

  const now = new Date();

  // 2. Per ogni source registrata, decidi se mandare
  for (const source of ["sessions", "cron"] as const) {
    const sourceCfg = cfg.sources[source];
    if (!sourceCfg.enabled) {
      result.sources.push({ source, sent: false, items: 0, reason: "disabled" });
      continue;
    }

    const types = RENDERERS.filter((r) => r.source === source).flatMap((r) => [
      ...r.matchTypes,
    ]);
    if (types.length === 0) {
      result.sources.push({ source, sent: false, items: 0, reason: "no_renderers" });
      continue;
    }

    const lastSent = await getLastSentForTypes(types);
    if (!scheduleAllowsSend(sourceCfg.schedule, lastSent, now)) {
      result.sources.push({ source, sent: false, items: 0, reason: "throttled" });
      continue;
    }

    // 3. SELECT candidate notifications
    const candidates = await db
      .select()
      .from(adminNotifications)
      .where(
        and(
          inArray(adminNotifications.type, types),
          isNull(adminNotifications.emailSentAt),
          isNull(adminNotifications.resolvedAt),
          isNull(adminNotifications.dismissedAt),
          lte(adminNotifications.createdAt, now),
        ),
      )
      .orderBy(asc(adminNotifications.createdAt));

    const filtered = candidates.filter((n) =>
      meetsThreshold(n.severity, sourceCfg.severityThreshold),
    );

    if (filtered.length === 0) {
      result.sources.push({ source, sent: false, items: 0, reason: "no_candidates" });
      continue;
    }

    // 4. Group per type (renderer-level)
    const byType = new Map<string, typeof filtered>();
    for (const n of filtered) {
      const arr = byType.get(n.type) ?? [];
      arr.push(n);
      byType.set(n.type, arr);
    }

    let totalSent = 0;
    let sourceError: string | undefined;

    for (const [type, items] of byType) {
      const renderer = findRendererForType(type);
      if (!renderer) continue;
      try {
        const { subject, html } = await renderer.render(items);
        const [first, ...rest] = recipients;
        await sendEmail({
          to: first,
          bcc: rest.length > 0 ? rest : undefined,
          subject,
          html,
        });
        // Mark sent
        await db
          .update(adminNotifications)
          .set({ emailSentAt: now })
          .where(
            inArray(
              adminNotifications.id,
              items.map((i) => i.id),
            ),
          );
        totalSent += items.length;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        sourceError = msg;
        // Mark error sui singoli items (incrementa attempts + log).
        await db
          .update(adminNotifications)
          .set({
            emailSendAttempts: sql`${adminNotifications.emailSendAttempts} + 1`,
            lastEmailError: msg,
          })
          .where(
            inArray(
              adminNotifications.id,
              items.map((i) => i.id),
            ),
          );
        console.error(
          `[email-channel] dispatch failed for type=${type} (source=${source}):`,
          err,
        );
        result.ok = false;
      }
    }

    result.sources.push({
      source,
      sent: totalSent > 0,
      items: totalSent,
      error: sourceError,
    });
  }

  return result;
}
