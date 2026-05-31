// lib/email/templates/business-rejected.ts
//
// Inviata quando un admin rifiuta la richiesta di account azienda.
// `reason` è il motivo opzionale scritto dall'admin; se assente il body
// usa una formulazione neutra.
//
// Vars disponibili: appName, userName, userEmail, companyName, reason, appUrl.
import { getLocalizedEmailSettings } from "@/lib/email/locale";
import {
  paragraphs,
  renderEmail,
  resolveEmailLogoUrl,
} from "@/lib/email/layout";
import { sendEmail } from "@/lib/email/resend";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";

export async function sendBusinessRejectedEmail(params: {
  to: string;
  userName?: string;
  companyName: string;
  reason?: string | null;
  locale?: Locale;
}) {
  const { to, userName, companyName, reason, locale = DEFAULT_LOCALE } = params;
  const settings = await getLocalizedEmailSettings(locale);
  const { app_name } = settings;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const greeting = userName ? `Ciao ${userName},` : "Ciao,";

  const reasonText = reason?.trim() || "—";

  const vars = {
    appName: app_name,
    userName: userName ?? "",
    userEmail: to,
    companyName,
    reason: reasonText,
    appUrl,
  };

  const subject = resolveTemplate(
    settings.email_businessrejected_subject,
    `Aggiornamento sulla tua richiesta di account azienda su ${app_name}`,
    vars,
  );
  const bcc = settings.email_businessrejected_bcc ?? undefined;
  const bodyText = resolveTemplate(
    settings.email_businessrejected_body,
    `Abbiamo esaminato la richiesta di verifica per ${companyName}, ma per ora non possiamo approvarla.

Motivo: ${reasonText}

Puoi correggere i dati e inviare una nuova richiesta dalle impostazioni del tuo account.`,
    vars,
  );
  const footerText = resolveTemplate(
    settings.email_businessrejected_footer,
    `© ${new Date().getFullYear()} ${app_name} · Email automatica, non rispondere a questo indirizzo`,
    vars,
  );

  const contentHtml = `${paragraphs(bodyText)}`;

  await sendEmail({
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
}

function resolveTemplate(
  stored: string | null,
  fallback: string,
  vars: Record<string, string>,
): string {
  const tpl = stored?.trim() || fallback;
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
}
