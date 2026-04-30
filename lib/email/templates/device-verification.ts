// lib/email/templates/device-verification.ts
import { getAppSettings } from "@/lib/db/settings-queries";
import {
  otpCard,
  paragraphs,
  renderEmail,
  resolveEmailLogoUrl,
} from "@/lib/email/layout";
import { sendEmail } from "@/lib/email/resend";

export async function sendDeviceVerificationEmail(
  to: string,
  code: string,
  firstName?: string,
): Promise<void> {
  const settings = await getAppSettings();
  const { app_name } = settings;
  const greeting = firstName ? `Ciao ${firstName},` : "Ciao,";

  const subject = `${code} è il tuo codice di accesso da nuovo dispositivo`;

  const bodyText = `Abbiamo rilevato un accesso al tuo account su ${app_name} da un dispositivo non riconosciuto. Inserisci il codice qui sotto per confermare che sei tu.`;

  const contentHtml = `
    ${paragraphs(bodyText)}
    ${otpCard("Codice di verifica dispositivo", code)}
    <p style="margin:0 0 6px;font-size:13px;color:#9ca3af;line-height:1.55;">⏱ Il codice è valido per <strong>15 minuti</strong>.</p>
    <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.55;">Se non stai cercando di accedere, ignora questa email e considera di cambiare la password.</p>
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
      footerText: `© ${new Date().getFullYear()} ${app_name} · Tutti i diritti riservati`,
    }),
  });

  if (error) {
    console.error("[device-verification] Resend error:", error);
  }
}
