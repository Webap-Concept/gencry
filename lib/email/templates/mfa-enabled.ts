// lib/email/templates/mfa-enabled.ts
//
// Email di notifica quando l'utente attiva l'autenticazione a due fattori.
// È un security touchpoint: se l'utente non riconosce l'azione, deve
// reagire subito (recovery o contatto supporto).
//
// Subject/body/footer/bcc sono customizzabili dall'admin in
// /admin/settings/email (chiavi `email_mfaenabled_*`). Se vuoti, usa
// i fallback hardcoded definiti qui sotto.

import { getLocalizedEmailSettings } from "@/lib/email/locale";
import {
  paragraphs,
  renderEmail,
  resolveEmailLogoUrl,
} from "@/lib/email/layout";
import { sendEmail } from "@/lib/email/resend";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";

export async function sendMfaEnabledEmail(
  to: string,
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
  };

  const subject = resolveTemplate(
    settings.email_mfaenabled_subject,
    `Autenticazione a due fattori attivata — ${app_name}`,
    vars,
  );
  const bcc = settings.email_mfaenabled_bcc ?? undefined;
  const bodyText = resolveTemplate(
    settings.email_mfaenabled_body,
    `Hai appena attivato l'autenticazione a due fattori sul tuo account ${app_name}. Da ora in poi al login ti chiederemo un codice generato dalla tua app autenticatore oltre alla password.\n\nConserva i recovery codes in un posto sicuro: sono l'unico modo per accedere se perdi il telefono.\n\nSe non sei stato tu, accedi al tuo account, disabilita la verifica e contatta subito l'assistenza.`,
    vars,
  );
  const footerText = resolveTemplate(
    settings.email_mfaenabled_footer,
    `© ${new Date().getFullYear()} ${app_name} · Tutti i diritti riservati`,
    vars,
  );

  await sendEmail({
    to,
    bcc,
    subject,
    html: renderEmail({
      appName: app_name,
      logoUrl: resolveEmailLogoUrl(settings),
      title: subject,
      greeting,
      contentHtml: paragraphs(bodyText),
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
