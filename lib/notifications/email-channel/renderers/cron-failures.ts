// lib/notifications/email-channel/renderers/cron-failures.ts
//
// Renderer per le notifiche di tipo `cron_job_failure` (popolate dal
// generator `cron-failures.ts` quando un cron fallisce in modo persistente
// ed entra nella Dead Letter Queue di QStash). 1 email = 1 digest che
// riassume tutti i job falliti dal lastSentAt.
import "server-only";
import { buildAdminPath } from "@/lib/admin-paths";
import { getAppSettings } from "@/lib/db/settings-queries";
import { renderEmail, resolveEmailLogoUrl } from "@/lib/email/layout";
import { emailTheme as t } from "@/lib/email/theme";
import type {
  NotificationRenderer,
  RenderResult,
  RendererItem,
} from "../types";

function severityBadge(severity: string): string {
  const colors: Record<string, { bg: string; fg: string }> = {
    critical: { bg: "#fef2f2", fg: "#991b1b" },
    warning: { bg: "#fffbeb", fg: "#92400e" },
    info: { bg: "#eff6ff", fg: "#1e40af" },
  };
  const c = colors[severity] ?? colors.info;
  return `<span style="display:inline-block;padding:2px 8px;border-radius:9999px;background:${c.bg};color:${c.fg};font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em">${severity}</span>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export const cronFailuresRenderer: NotificationRenderer = {
  source: "cron",
  matchTypes: ["cron_job_failure"],
  async render(items: RendererItem[]): Promise<RenderResult> {
    const settings = await getAppSettings();
    const appName = settings.app_name ?? "Admin";
    const logoUrl = resolveEmailLogoUrl(settings);
    const adminCron = await buildAdminPath("/cron");
    const adminSettings = await buildAdminPath("/settings/notifications");
    const count = items.length;
    const subject =
      count === 1
        ? `[Cron] ${items[0].title}`
        : `[Cron] ${count} job in errore`;

    const sevOrder: Record<string, number> = {
      critical: 3,
      warning: 2,
      info: 1,
    };
    const sorted = [...items].sort((a, b) => {
      const da = sevOrder[a.severity] ?? 0;
      const db = sevOrder[b.severity] ?? 0;
      if (db !== da) return db - da;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });

    const rows = sorted
      .map((n) => {
        const meta = (n.metadata ?? {}) as Record<string, unknown>;
        const jobname = typeof meta.jobname === "string" ? meta.jobname : "—";
        const lastError =
          typeof meta.lastErrorMessage === "string"
            ? meta.lastErrorMessage
            : null;
        return `
<tr>
  <td style="padding:12px 16px;border-bottom:1px solid ${t.border};vertical-align:top">
    <div style="margin-bottom:4px">
      ${severityBadge(n.severity)}
      <code style="margin-left:8px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;color:${t.textPrimary}">${escapeHtml(jobname)}</code>
    </div>
    <div style="color:${t.textPrimary};font-size:14px;font-weight:500">${escapeHtml(n.title)}</div>
    ${n.body ? `<div style="color:${t.textMuted};font-size:13px;margin-top:4px">${escapeHtml(n.body)}</div>` : ""}
    ${lastError ? `<pre style="margin:8px 0 0;padding:8px;background:${t.bgPage};border-radius:6px;font-size:11px;color:${t.textMuted};white-space:pre-wrap;overflow-x:auto">${escapeHtml(lastError)}</pre>` : ""}
  </td>
</tr>`;
      })
      .join("");

    const contentHtml = `
<p style="margin:0 0 16px;color:${t.textPrimary};font-size:15px;line-height:1.5">
  ${count === 1 ? "Un cron job ha fallito di recente." : `${count} cron job hanno fallito di recente.`}
  Verifica lo storico in <a href="${adminCron}" style="color:${t.brandPrimary}">/admin/cron</a> e correggi prima che diventi sistemico.
</p>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border:1px solid ${t.border};border-radius:8px;background:${t.bgCard};overflow:hidden">
  ${rows}
</table>
<p style="margin:16px 0 0;color:${t.textMuted};font-size:12px">
  Stai ricevendo questa email perché sei destinatario configurato per gli alert
  cron in <a href="${adminSettings}" style="color:${t.brandPrimary}">/admin/settings/notifications</a>.
</p>
`.trim();

    const html = renderEmail({
      appName,
      logoUrl,
      title: subject,
      contentHtml,
      footerText: `${appName} — admin notifications`,
    });

    return { subject, html };
  },
};
