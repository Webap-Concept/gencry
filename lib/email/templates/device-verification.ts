// lib/email/templates/device-verification.ts
//
// Email inviata quando l'utente accede da un dispositivo non riconosciuto.
// Contiene un OTP di 6 cifre da inserire per confermare l'identità.

import { getLocalizedEmailSettings } from "@/lib/email/locale";
import {
  otpCard,
  paragraphs,
  renderEmail,
  resolveEmailLogoUrl,
} from "@/lib/email/layout";
import { sendEmail } from "@/lib/email/resend";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";

export async function sendDeviceVerificationEmail(
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
    settings.email_device_subject,
    `${code} è il tuo codice di accesso da nuovo dispositivo`,
    vars,
  );
  const bcc = settings.email_device_bcc ?? undefined;
  const bodyText = resolveTemplate(
    settings.email_device_body,
    `Abbiamo rilevato un accesso al tuo account su ${app_name} da un dispositivo non riconosciuto. Inserisci il codice qui sotto per confermare che sei tu.`,
    vars,
  );
  const footerText = resolveTemplate(
    settings.email_device_footer,
    `© ${new Date().getFullYear()} ${app_name} · Tutti i diritti riservati`,
    vars,
  );

  const contentHtml = `
    ${paragraphs(bodyText)}
    ${otpCard("Codice di verifica dispositivo", code)}
    <p style="margin:0 0 6px;font-size:13px;color:#9ca3af;line-height:1.55;">⏱ Il codice è valido per <strong>15 minuti</strong>.</p>
    <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.55;">Se non stai cercando di accedere, ignora questa email e considera di cambiare la password.</p>
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
    console.error("[device-verification] Resend error:", error);
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
