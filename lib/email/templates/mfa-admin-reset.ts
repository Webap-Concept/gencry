// lib/email/templates/mfa-admin-reset.ts
//
// Email inviata all'utente quando un amministratore resetta la sua MFA
// (es. ha perso phone + recovery codes e ha contattato il supporto).
// Include la motivazione fornita dall'admin per audit/trasparenza.

import { getAppSettings } from "@/lib/db/settings-queries";
import {
  paragraphs,
  renderEmail,
  resolveEmailLogoUrl,
} from "@/lib/email/layout";
import { sendEmail } from "@/lib/email/resend";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function sendMfaAdminResetEmail(
  to: string,
  reason: string,
  firstName?: string,
): Promise<void> {
  const settings = await getAppSettings();
  const { app_name } = settings;
  const greeting = firstName ? `Ciao ${firstName},` : "Ciao,";

  const subject = `Verifica a due fattori resettata dal supporto — ${app_name}`;

  const reasonBlock = reason.trim()
    ? `<div style="margin:18px 0;padding:12px 14px;background:#f9fafb;border-left:3px solid #d1d5db;border-radius:4px;font-size:13px;color:#374151;line-height:1.55;"><strong>Motivazione del supporto:</strong><br/>${escapeHtml(reason)}</div>`
    : "";

  const contentHtml = `
    ${paragraphs(`Un amministratore di ${app_name} ha resettato la verifica a due fattori sul tuo account. Tutti i recovery codes precedenti sono stati invalidati e al prossimo login useremo solo email e password.`)}
    ${reasonBlock}
    <p style="margin:0 0 12px;font-size:13px;color:#374151;line-height:1.55;"><strong>Cosa fare ora:</strong> per ripristinare la protezione, accedi al tuo account e riattiva la verifica a due fattori dalle impostazioni di sicurezza.</p>
    <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.55;">Se non hai richiesto questa operazione, contatta subito l'assistenza e cambia la password.</p>
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
