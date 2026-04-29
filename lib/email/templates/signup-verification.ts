// lib/email/templates/signup-verification.ts
import { getAppSettings } from "@/lib/db/settings-queries";
import {
  otpCard,
  paragraphs,
  renderEmail,
  resolveEmailLogoUrl,
} from "@/lib/email/layout";
import { sendEmail } from "@/lib/email/resend";

export async function sendSignupVerificationEmail(
  to: string,
  code: string,
  firstName?: string,
): Promise<void> {
  const settings = await getAppSettings();
  const { app_name } = settings;
  const greeting = firstName ? `Ciao ${firstName},` : "Ciao,";

  const vars = {
    appName: app_name,
    userEmail: to,
    userName: firstName ?? "",
    otpCode: code,
  };

  const subject = resolveTemplate(
    settings.email_signup_subject,
    `${code} è il tuo codice di verifica ${app_name}`,
    vars,
  );
  const bcc = settings.email_signup_bcc ?? undefined;
  const bodyText = resolveTemplate(
    settings.email_signup_body,
    `Grazie per esserti registrato su ${app_name}. Inserisci il codice qui sotto per verificare il tuo indirizzo email e completare la registrazione.`,
    vars,
  );
  const footerText = resolveTemplate(
    settings.email_signup_footer,
    `© ${new Date().getFullYear()} ${app_name} · Tutti i diritti riservati`,
    vars,
  );

  const contentHtml = `
    ${paragraphs(bodyText)}
    ${otpCard("Codice di verifica", code)}
    <p style="margin:0 0 6px;font-size:13px;color:#9ca3af;line-height:1.55;">⏱ Il codice è valido per <strong>20 minuti</strong>.</p>
    <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.55;">Se non hai richiesto questa registrazione, puoi ignorare questa email.</p>
  `;

  const { error } = await sendEmail({
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

  if (error) {
    console.error("[signup-verification] Resend error:", error);
  }
}

function resolveTemplate(
  stored: string | null,
  fallback: string,
  vars: Record<string, string>,
): string {
  const tpl = stored?.trim() || fallback;
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
}
