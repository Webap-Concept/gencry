// lib/email/templates/account-deletion-otp.ts
//
// Email con OTP a 6 cifre per confermare l'eliminazione account quando
// l'utente non ha password locale (OAuth-only). È il "second factor"
// del flusso di re-auth alternativo via email.

import { getLocalizedEmailSettings } from "@/lib/email/locale";
import {
  otpCard,
  paragraphs,
  renderEmail,
  resolveEmailLogoUrl,
} from "@/lib/email/layout";
import { sendEmail } from "@/lib/email/resend";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";

export async function sendAccountDeletionOtpEmail(params: {
  toEmail: string;
  firstName: string | null;
  code: string;
  locale?: Locale;
}): Promise<void> {
  const { toEmail, firstName, code, locale = DEFAULT_LOCALE } = params;
  const settings = await getLocalizedEmailSettings(locale);
  const appName = settings.app_name;
  const greeting = firstName ? `Ciao ${firstName},` : "Ciao,";

  const vars = {
    appName,
    userEmail: toEmail,
    userName: firstName ?? "",
    otpCode: code,
  };

  const subject = resolveTemplate(
    settings.email_accountdeletionotp_subject ?? null,
    `${code} è il tuo codice per eliminare l'account ${appName}`,
    vars,
  );
  const bcc = settings.email_accountdeletionotp_bcc ?? undefined;
  const bodyText = resolveTemplate(
    settings.email_accountdeletionotp_body ?? null,
    `Hai chiesto di eliminare il tuo account ${appName}. Inserisci il codice qui sotto per confermare. Se non sei stato tu, ignora questa email — il codice scade tra 15 minuti.`,
    vars,
  );
  const footerText = resolveTemplate(
    settings.email_accountdeletionotp_footer ?? null,
    `© ${new Date().getFullYear()} ${appName} · Tutti i diritti riservati`,
    vars,
  );

  const contentHtml = `
    ${paragraphs(bodyText)}
    ${otpCard("Codice di conferma eliminazione", code)}
    <p style="margin:0 0 6px;font-size:13px;color:#9ca3af;line-height:1.55;">⏱ Il codice è valido per <strong>15 minuti</strong>.</p>
    <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.55;">Se non hai richiesto di eliminare il tuo account, ignora questa email e cambia password se sospetti accessi indesiderati.</p>
  `;

  const { error } = await sendEmail({
    to: toEmail,
    bcc,
    subject,
    html: renderEmail({
      appName,
      logoUrl: resolveEmailLogoUrl(settings),
      title: subject,
      greeting,
      contentHtml,
      footerText,
    }),
  });

  if (error) {
    console.error("[account-deletion-otp] Resend error:", error);
    throw new Error("Email send failed");
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
