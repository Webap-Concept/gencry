// lib/email/templates/waiting-list.ts
// Email di conferma iscrizione alla waiting list (landing coming-soon).
// Stessa struttura di welcome.ts: subject/body/footer prendibili dai
// settings dall'admin, fallback hardcoded se vuoti.

import { getAppSettings } from "@/lib/db/settings-queries";
import { sendEmail } from "@/lib/email/resend";
import { emailTheme as t } from "@/lib/email/theme";

export async function sendWaitingListEmail(to: string) {
  const settings = await getAppSettings();
  const { app_name } = settings;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  const vars = { appName: app_name, userEmail: to, appUrl };

  const subject = resolveTemplate(
    settings.email_waitinglist_subject,
    `Sei nella waiting list di ${app_name}`,
    vars,
  );
  const bcc = settings.email_waitinglist_bcc ?? undefined;
  const bodyText = resolveTemplate(
    settings.email_waitinglist_body,
    `Ciao,\n\nGrazie per esserti iscritto alla waiting list di ${app_name}.\n\nSei tra i primi a sapere quando apriremo le porte: ti scriveremo non appena saremo pronti.\n\nA presto.`,
    vars,
  );
  const footerText = resolveTemplate(
    settings.email_waitinglist_footer,
    `© ${new Date().getFullYear()} ${app_name}`,
    vars,
  );

  await sendEmail({
    to,
    bcc,
    subject,
    html: buildHtml({ bodyText, footerText, appName: app_name, appUrl }),
  });
}

function resolveTemplate(
  stored: string | null,
  fallback: string,
  vars: Record<string, string>,
): string {
  const tpl = stored?.trim() || fallback;
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
}

function buildHtml({
  bodyText,
  footerText,
  appName,
  appUrl,
}: {
  bodyText: string;
  footerText: string;
  appName: string;
  appUrl: string;
}): string {
  const bodyHtml = bodyText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map(
      (line) =>
        `<p style="margin:0 0 12px;color:${t.textMuted};font-size:15px;line-height:1.6;">${line}</p>`,
    )
    .join("");

  return `
<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${appName}</title>
</head>
<body style="margin:0;padding:0;background:${t.bgPage};font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${t.bgPage};padding:40px 0;">
    <tr>
      <td align="center">
        <table width="520" cellpadding="0" cellspacing="0"
          style="background:${t.bgCard};border-radius:${t.radiusXl};overflow:hidden;border:1px solid ${t.border};">
          <tr>
            <td style="background:${t.brandPrimary};padding:32px 40px;">
              <h1 style="margin:0;color:${t.textInverse};font-size:22px;font-weight:700;letter-spacing:-0.3px;">
                ${appName}
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;">
              ${bodyHtml}
              ${
                appUrl
                  ? `<p style="margin:24px 0 0;color:${t.textLight};font-size:13px;">
                       Hai dubbi? Scrivici rispondendo a questa email.
                     </p>`
                  : ""
              }
            </td>
          </tr>
          <tr>
            <td style="background:${t.bgPage};padding:20px 40px;border-top:1px solid ${t.border};">
              <p style="margin:0;color:${t.textLight};font-size:12px;">${footerText}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}
