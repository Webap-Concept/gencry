// lib/email/templates/staff-invitation.ts
import { getAppSettings } from "@/lib/db/settings-queries";
import {
  ctaButton,
  paragraphs,
  renderEmail,
  resolveEmailLogoUrl,
} from "@/lib/email/layout";
import { sendEmail } from "@/lib/email/resend";
import { emailTheme as t } from "@/lib/email/theme";

export async function sendStaffInvitationEmail(
  to: string,
  token: string,
  roleLabel: string,
  inviterName: string,
) {
  const settings = await getAppSettings();
  const { app_name } = settings;
  const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL}/staff-invite/${token}`;

  const subject = `Invito Staff — ${app_name}`;
  const greeting = "Ciao,";

  const bodyText = `${inviterName} ti ha invitato a entrare nel team staff di ${app_name} con il ruolo di ${roleLabel}.\n\nClicca il pulsante qui sotto per accettare o rifiutare l'invito. Il link è valido per 48 ore.`;

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
    subject,
    html: renderEmail({
      appName: app_name,
      logoUrl: resolveEmailLogoUrl(settings),
      title: subject,
      greeting,
      contentHtml,
      footerText: `© ${new Date().getFullYear()} ${app_name} · Tutti i diritti riservati`,
    }),
  });
}
