// lib/email/templates/mfa-enabled.ts
//
// Email di notifica quando l'utente attiva l'autenticazione a due fattori.
// È un security touchpoint: se l'utente non riconosce l'azione, deve
// reagire subito (recovery o contatto supporto).

import { getAppSettings } from "@/lib/db/settings-queries";
import {
  paragraphs,
  renderEmail,
  resolveEmailLogoUrl,
} from "@/lib/email/layout";
import { sendEmail } from "@/lib/email/resend";

export async function sendMfaEnabledEmail(
  to: string,
  firstName?: string,
): Promise<void> {
  const settings = await getAppSettings();
  const { app_name } = settings;
  const greeting = firstName ? `Ciao ${firstName},` : "Ciao,";

  const subject = `Autenticazione a due fattori attivata — ${app_name}`;

  const contentHtml = `
    ${paragraphs(`Hai appena attivato l'autenticazione a due fattori sul tuo account ${app_name}. Da ora in poi al login ti chiederemo un codice generato dalla tua app autenticatore oltre alla password.`)}
    <p style="margin:0 0 12px;font-size:13px;color:#9ca3af;line-height:1.55;">Conserva i recovery codes che ti abbiamo mostrato in un posto sicuro: sono l'unico modo per accedere se perdi il telefono.</p>
    <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.55;">Se non sei stato tu, accedi al tuo account, disabilita la verifica e contatta subito l'assistenza.</p>
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
