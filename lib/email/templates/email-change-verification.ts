// lib/email/templates/email-change-verification.ts
//
// Email inviata al NUOVO indirizzo quando l'utente richiede un cambio email
// dalla sezione /settings/account. Contiene un OTP di 6 cifre da inserire
// per confermare la titolarità dell'indirizzo prima dello switch.

import { getAppSettings } from "@/lib/db/settings-queries";
import {
  otpCard,
  paragraphs,
  renderEmail,
  resolveEmailLogoUrl,
} from "@/lib/email/layout";
import { sendEmail } from "@/lib/email/resend";

export async function sendEmailChangeVerificationEmail(
  to: string,
  code: string,
  firstName?: string,
): Promise<void> {
  const settings = await getAppSettings();
  const { app_name } = settings;
  const greeting = firstName ? `Ciao ${firstName},` : "Ciao,";

  const subject = `${code} è il tuo codice per confermare la nuova email ${app_name}`;
  const bodyText = `Hai richiesto di cambiare l'email del tuo account ${app_name} con questo indirizzo. Inserisci il codice qui sotto per confermare il cambio. Se non sei stato tu, ignora questa email — il cambio non verrà applicato.`;
  const footerText = `© ${new Date().getFullYear()} ${app_name} · Tutti i diritti riservati`;

  const contentHtml = `
    ${paragraphs(bodyText)}
    ${otpCard("Codice di conferma", code)}
    <p style="margin:0 0 6px;font-size:13px;color:#9ca3af;line-height:1.55;">⏱ Il codice è valido per <strong>15 minuti</strong>.</p>
    <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.55;">Se non hai richiesto questo cambio, puoi ignorare questa email in tutta sicurezza.</p>
  `;

  const { error } = await sendEmail({
    to,
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
