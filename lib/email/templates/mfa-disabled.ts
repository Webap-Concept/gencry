// lib/email/templates/mfa-disabled.ts
//
// Email di notifica quando l'utente disattiva la verifica a due fattori.
// Stesso ruolo di security touchpoint dell'attivazione: se non è stato
// l'utente, deve reagire (cambio password + contatto supporto).

import { getAppSettings } from "@/lib/db/settings-queries";
import {
  paragraphs,
  renderEmail,
  resolveEmailLogoUrl,
} from "@/lib/email/layout";
import { sendEmail } from "@/lib/email/resend";

export async function sendMfaDisabledEmail(
  to: string,
  firstName?: string,
): Promise<void> {
  const settings = await getAppSettings();
  const { app_name } = settings;
  const greeting = firstName ? `Ciao ${firstName},` : "Ciao,";

  const subject = `Autenticazione a due fattori disattivata — ${app_name}`;

  const contentHtml = `
    ${paragraphs(`Hai appena disattivato l'autenticazione a due fattori sul tuo account ${app_name}. Al prossimo login useremo solo email e password — il livello di protezione del tuo account è diminuito.`)}
    <p style="margin:0 0 12px;font-size:13px;color:#9ca3af;line-height:1.55;">Tutti i recovery codes che avevi sono stati invalidati. Se vuoi puoi riattivare la verifica a due fattori in qualsiasi momento dalle impostazioni di sicurezza.</p>
    <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.55;">Se non sei stato tu, cambia subito la password e contatta l'assistenza.</p>
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
