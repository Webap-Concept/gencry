// lib/email/templates/mfa-admin-reset.ts
//
// Email inviata all'utente quando un amministratore resetta la sua MFA
// (es. ha perso phone + recovery codes e ha contattato il supporto).
// Include la motivazione fornita dall'admin per audit/trasparenza.
//
// Subject/body/footer/bcc customizzabili in /admin/settings/email
// (chiavi `email_mfaadminreset_*`). Il body può contenere `{{reason}}`
// per interpolare la motivazione testuale dell'admin.

import { getAppSettings } from "@/lib/db/settings-queries";
import {
  paragraphs,
  renderEmail,
  resolveEmailLogoUrl,
} from "@/lib/email/layout";
import { sendEmail } from "@/lib/email/resend";

export async function sendMfaAdminResetEmail(
  to: string,
  reason: string,
  firstName?: string,
): Promise<void> {
  const settings = await getAppSettings();
  const { app_name } = settings;
  const greeting = firstName ? `Ciao ${firstName},` : "Ciao,";

  const vars = {
    appName: app_name,
    userEmail: to,
    userName: firstName ?? "",
    reason: reason.trim(),
  };

  const subject = resolveTemplate(
    settings.email_mfaadminreset_subject,
    `Verifica a due fattori resettata dal supporto — ${app_name}`,
    vars,
  );
  const bcc = settings.email_mfaadminreset_bcc ?? undefined;
  const bodyText = resolveTemplate(
    settings.email_mfaadminreset_body,
    `Un amministratore di ${app_name} ha resettato la verifica a due fattori sul tuo account. Tutti i recovery codes precedenti sono stati invalidati e al prossimo login useremo solo email e password.\n\nMotivazione del supporto: ${vars.reason}\n\nPer ripristinare la protezione, accedi al tuo account e riattiva la verifica a due fattori dalle impostazioni di sicurezza. Se non hai richiesto questa operazione, contatta subito l'assistenza e cambia la password.`,
    vars,
  );
  const footerText = resolveTemplate(
    settings.email_mfaadminreset_footer,
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
