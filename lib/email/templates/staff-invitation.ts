// lib/email/templates/staff-invitation.ts
//
// Email inviata quando un admin invita un utente a far parte dello staff.
// Contiene un link cliccabile (CTA) all'invito, valido 48h.

import { getLocalizedEmailSettings } from "@/lib/email/locale";
import {
  ctaButton,
  paragraphs,
  renderEmail,
  resolveEmailLogoUrl,
} from "@/lib/email/layout";
import { sendEmail } from "@/lib/email/resend";
import { emailTheme as t } from "@/lib/email/theme";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";

export async function sendStaffInvitationEmail(
  to: string,
  token: string,
  roleLabel: string,
  inviterName: string,
  locale: Locale = DEFAULT_LOCALE,
) {
  const settings = await getLocalizedEmailSettings(locale);
  const { app_name } = settings;
  const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL}/staff-invite/${token}`;
  const greeting = "Ciao,";

  const vars = {
    appName: app_name,
    inviteeEmail: to,
    inviterName,
    roleLabel,
    inviteUrl,
  };

  const subject = resolveTemplate(
    settings.email_staffinvite_subject,
    `Invito Staff — ${app_name}`,
    vars,
  );
  const bcc = settings.email_staffinvite_bcc ?? undefined;
  const bodyText = resolveTemplate(
    settings.email_staffinvite_body,
    `${inviterName} ti ha invitato a entrare nel team staff di ${app_name} con il ruolo di ${roleLabel}.\n\nClicca il pulsante qui sotto per accettare o rifiutare l'invito. Il link è valido per 48 ore.`,
    vars,
  );
  const footerText = resolveTemplate(
    settings.email_staffinvite_footer,
    `© ${new Date().getFullYear()} ${app_name} · Tutti i diritti riservati`,
    vars,
  );

  const contentHtml = `
    ${paragraphs(bodyText)}
    ${ctaButton(inviteUrl, "Visualizza invito")}
    <p style="margin:24px 0 16px;color:${t.textLight};font-size:12px;line-height:1.55;">
      Se il pulsante non funziona, copia e incolla questo link nel browser:<br/>
      <a href="${inviteUrl}" style="color:${t.brandPrimary};word-break:break-all;">${inviteUrl}</a>
    </p>
    <p style="margin:0;color:${t.textLight};font-size:13px;line-height:1.55;">
      Se non ti aspettavi questo invito, puoi ignorare questa email.
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
