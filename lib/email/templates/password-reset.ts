// lib/email/templates/password-reset.ts
import { getAppSettings } from "@/lib/db/settings-queries";
import {
  ctaButton,
  paragraphs,
  renderEmail,
  resolveEmailLogoUrl,
} from "@/lib/email/layout";
import { sendEmail } from "@/lib/email/resend";
import { emailTheme as t } from "@/lib/email/theme";

export async function sendPasswordResetEmail(
  to: string,
  token: string,
  userName?: string,
) {
  const settings = await getAppSettings();
  const { app_name } = settings;
  const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL}/reset-password?token=${token}`;
  const greeting = userName ? `Ciao ${userName},` : "Ciao,";

  const vars = {
    appName: app_name,
    userEmail: to,
    userName: userName ?? "",
    resetLink: resetUrl,
  };

  const subject = resolveTemplate(
    settings.email_reset_subject,
    `Reimposta la tua password — ${app_name}`,
    vars,
  );
  const bcc = settings.email_reset_bcc ?? undefined;
  const bodyText = resolveTemplate(
    settings.email_reset_body,
    `Hai richiesto di reimpostare la password del tuo account ${app_name}.\nClicca il pulsante qui sotto per procedere. Il link è valido per 30 minuti.`,
    vars,
  );
  const footerText = resolveTemplate(
    settings.email_reset_footer,
    `© ${new Date().getFullYear()} ${app_name} · Tutti i diritti riservati`,
    vars,
  );

  const contentHtml = `
    ${paragraphs(bodyText)}
    ${ctaButton(resetUrl, "Reimposta password")}
    <p style="margin:24px 0 16px;color:${t.textLight};font-size:12px;line-height:1.55;">
      Se il pulsante non funziona, copia e incolla questo link nel browser:<br/>
      <a href="${resetUrl}" style="color:${t.brandPrimary};word-break:break-all;">${resetUrl}</a>
    </p>
    <p style="margin:0;color:${t.textLight};font-size:13px;line-height:1.55;">
      Se non hai richiesto il reset della password, puoi ignorare questa email.
      Il tuo account è al sicuro.
    </p>
  `;

  await sendEmail({
    to,
    bcc,
    subject,
    html: renderEmail({
      appName: app_name,
      logoUrl: resolveEmailLogoUrl(settings),
      title: subject,
      greeting,
      contentHtml,
      footerText,
    }),
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
