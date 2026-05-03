// lib/email/templates/admin-suspicious-alerts.ts
//
// Digest email for suspicious-session alerts. Sent to the admins resolved
// by the runner (recipients.emails ∪ users with admin:access). Format is
// a digest, not one mail per alert: a single mail lists everything that
// fired since the last successful send, grouped by severity.

import { getAppSettings } from "@/lib/db/settings-queries";
import {
  paragraphs,
  renderEmail,
  resolveEmailLogoUrl,
} from "@/lib/email/layout";
import { sendEmail } from "@/lib/email/resend";
import { emailTheme as t } from "@/lib/email/theme";

const REASON_LABELS: Record<string, string> = {
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

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

const SEVERITY_LABEL: Record<string, string> = {
  critical: "Critical",
  warning: "Warning",
  info: "Info",
};

const SEVERITY_COLOR: Record<string, string> = {
  critical: "#b91c1c",
  warning: "#b45309",
  info: "#1e40af",
};

export type DigestAlert = {
  id: number;
  reason: string;
  severity: string;
  createdAt: Date;
  userId: string | null;
  sessionId: string | null;
  details: Record<string, unknown>;
};

const dateTimeFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

function severityBadge(severity: string): string {
  const color = SEVERITY_COLOR[severity] ?? "#475569";
  const bg = `${color}1a`;
  return `<span style="display:inline-block;background:${bg};color:${color};border:1px solid ${color}40;border-radius:999px;padding:2px 10px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">${SEVERITY_LABEL[severity] ?? severity}</span>`;
}

function detailsLine(details: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(details)) {
    if (v === null || v === undefined) continue;
    if (Array.isArray(v)) {
      const sample = v.slice(0, 3).join(", ");
      const suffix = v.length > 3 ? `, +${v.length - 3} more` : "";
      parts.push(`<b>${escape(k)}</b>: ${escape(sample)}${suffix}`);
    } else {
      parts.push(`<b>${escape(k)}</b>: ${escape(String(v))}`);
    }
  }
  return parts.join(" · ");
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function alertCard(a: DigestAlert, appDomain: string): string {
  const reasonLabel = REASON_LABELS[a.reason] ?? a.reason;
  const when = `${dateTimeFmt.format(a.createdAt)} UTC`;
  const userBit = a.userId
    ? `<a href="https://${appDomain}/admin/access/users/${a.userId}" style="color:${t.brandPrimary};text-decoration:none;">User ${a.userId.slice(0, 8)}…</a>`
    : "no specific user";

  return `
<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 12px;background:#fff;border:1px solid ${t.border};border-radius:10px;">
  <tr>
    <td style="padding:14px 16px;">
      <div style="margin-bottom:6px;">${severityBadge(a.severity)}
        <span style="margin-left:8px;font-size:13px;font-weight:600;color:${t.textPrimary};">${escape(reasonLabel)}</span>
      </div>
      <p style="margin:0 0 6px;font-size:12.5px;color:${t.textMuted};line-height:1.5;">
        ${userBit} · ${when}
      </p>
      <p style="margin:0;font-size:12px;color:${t.textMuted};line-height:1.55;">
        ${detailsLine(a.details) || "—"}
      </p>
    </td>
  </tr>
</table>
  `;
}

function buildSubject(alerts: DigestAlert[]): string {
  const counts: Record<string, number> = {};
  for (const a of alerts) counts[a.severity] = (counts[a.severity] ?? 0) + 1;
  const c = counts.critical ?? 0;
  const w = counts.warning ?? 0;
  if (c > 0 && w > 0) {
    return `🚨 ${c} critical + ${w} warning suspicious session alerts`;
  }
  if (c > 0) {
    return c === 1
      ? "🚨 1 critical suspicious session alert"
      : `🚨 ${c} critical suspicious session alerts`;
  }
  if (w > 0) {
    return w === 1
      ? "⚠️ 1 suspicious session warning"
      : `⚠️ ${w} suspicious session warnings`;
  }
  return alerts.length === 1
    ? "Suspicious session alert"
    : `${alerts.length} suspicious session alerts`;
}

export async function sendSuspiciousAlertsDigest({
  recipients,
  alerts,
  schedule,
}: {
  recipients: string[];
  alerts: DigestAlert[];
  schedule: string;
}): Promise<void> {
  if (recipients.length === 0 || alerts.length === 0) return;

  const settings = await getAppSettings();
  const appName = settings.app_name;
  const appDomain = settings.app_domain || "";

  // Sort: critical → warning → info, then newest first inside each group.
  const sorted = [...alerts].sort((a, b) => {
    const sa = SEVERITY_ORDER[a.severity] ?? 99;
    const sb = SEVERITY_ORDER[b.severity] ?? 99;
    if (sa !== sb) return sa - sb;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  const subject = buildSubject(sorted);
  const intro = `Detected ${sorted.length} suspicious session ${sorted.length === 1 ? "alert" : "alerts"} since the last digest (${schedule.replace("_", " ")}).`;

  const cardsHtml = sorted.map((a) => alertCard(a, appDomain)).join("\n");

  const link = appDomain
    ? `https://${appDomain}/admin/access/sessions?tab=alerts`
    : "/admin/access/sessions?tab=alerts";

  const contentHtml = `
    ${paragraphs(intro)}
    ${cardsHtml}
    <p style="margin:18px 0 0;font-size:13px;color:${t.textMuted};">
      Review and acknowledge them in the admin panel:
      <a href="${link}" style="color:${t.brandPrimary};text-decoration:none;font-weight:600;">Open Sessions → Alerts</a>
    </p>
  `;

  // Single send with everyone in BCC so admins don't see each other's
  // addresses. The `to` is the sender mailbox itself for delivery
  // semantics; everyone real is BCC'd.
  const [first, ...rest] = recipients;
  await sendEmail({
    to: first,
    bcc: rest.length > 0 ? rest : undefined,
    subject,
    html: renderEmail({
      appName,
      logoUrl: resolveEmailLogoUrl(settings),
      title: subject,
      contentHtml,
      footerText: `© ${new Date().getFullYear()} ${appName} · Sent because you are listed as a recipient in /admin/settings/notifications.`,
    }),
  });
}
