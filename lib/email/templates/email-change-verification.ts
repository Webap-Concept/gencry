// lib/email/templates/email-change-verification.ts
//
// Email inviata al NUOVO indirizzo quando l'utente richiede un cambio email
// dalla sezione /settings/account. Contiene un OTP di 6 cifre da inserire
// per confermare la titolarità dell'indirizzo prima dello switch.

import { getLocalizedEmailSettings } from "@/lib/email/locale";
import {
  otpCard,
  paragraphs,
  renderEmail,
  resolveEmailLogoUrl,
} from "@/lib/email/layout";
import { sendEmail } from "@/lib/email/resend";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";

export async function sendEmailChangeVerificationEmail(
  to: string,
  code: string,
  firstName?: string,
  locale: Locale = DEFAULT_LOCALE,
): Promise<void> {
  const settings = await getLocalizedEmailSettings(locale);
  const { app_name } = settings;
  const greeting = firstName ? `Ciao ${firstName},` : "Ciao,";

  const vars = {
    appName: app_name,
    userEmail: to,
    userName: firstName ?? "",
    otpCode: code,
  };

  const subject = resolveTemplate(
    settings.email_emailchange_subject,
    `${code} è il tuo codice per confermare la nuova email ${app_name}`,
    vars,
  );
  const bcc = settings.email_emailchange_bcc ?? undefined;
  const bodyText = resolveTemplate(
    settings.email_emailchange_body,
    `Hai richiesto di cambiare l'email del tuo account ${app_name} con questo indirizzo. Inserisci il codice qui sotto per confermare il cambio. Se non sei stato tu, ignora questa email — il cambio non verrà applicato.`,
    vars,
  );
  const footerText = resolveTemplate(
    settings.email_emailchange_footer,
    `© ${new Date().getFullYear()} ${app_name} · Tutti i diritti riservati`,
    vars,
  );

  const contentHtml = `
    ${paragraphs(bodyText)}
    ${otpCard("Codice di conferma", code)}
    <p style="margin:0 0 6px;font-size:13px;color:#9ca3af;line-height:1.55;">⏱ Il codice è valido per <strong>15 minuti</strong>.</p>
    <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.55;">Se non hai richiesto questo cambio, puoi ignorare questa email in tutta sicurezza.</p>
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
    console.error("[email-change-verification] Resend error:", error);
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
