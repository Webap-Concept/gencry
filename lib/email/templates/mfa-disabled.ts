// lib/email/templates/mfa-disabled.ts
//
// Email di notifica quando l'utente disattiva la verifica a due fattori.
// Stesso ruolo di security touchpoint dell'attivazione: se non è stato
// l'utente, deve reagire (cambio password + contatto supporto).
//
// Subject/body/footer/bcc customizzabili in /admin/settings/email
// (chiavi `email_mfadisabled_*`).

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

  const vars = {
    appName: app_name,
    userEmail: to,
    userName: firstName ?? "",
  };

  const subject = resolveTemplate(
    settings.email_mfadisabled_subject,
    `Autenticazione a due fattori disattivata — ${app_name}`,
    vars,
  );
  const bcc = settings.email_mfadisabled_bcc ?? undefined;
  const bodyText = resolveTemplate(
    settings.email_mfadisabled_body,
    `Hai appena disattivato l'autenticazione a due fattori sul tuo account ${app_name}. Al prossimo login useremo solo email e password — il livello di protezione del tuo account è diminuito.\n\nTutti i recovery codes che avevi sono stati invalidati. Se vuoi puoi riattivare la verifica a due fattori in qualsiasi momento dalle impostazioni di sicurezza.\n\nSe non sei stato tu, cambia subito la password e contatta l'assistenza.`,
    vars,
  );
  const footerText = resolveTemplate(
    settings.email_mfadisabled_footer,
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
