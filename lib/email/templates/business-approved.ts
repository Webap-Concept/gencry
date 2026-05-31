// lib/email/templates/business-approved.ts
//
// Inviata quando un admin approva la richiesta di account azienda. Il
// profilo è ora un account business verificato (badge attivo).
//
// Vars disponibili: appName, userName, userEmail, companyName, appUrl.
import { getLocalizedEmailSettings } from "@/lib/email/locale";
import {
  paragraphs,
  renderEmail,
  resolveEmailLogoUrl,
} from "@/lib/email/layout";
import { sendEmail } from "@/lib/email/resend";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";

export async function sendBusinessApprovedEmail(params: {
  to: string;
  userName?: string;
  companyName: string;
  locale?: Locale;
}) {
  const { to, userName, companyName, locale = DEFAULT_LOCALE } = params;
  const settings = await getLocalizedEmailSettings(locale);
  const { app_name } = settings;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const greeting = userName ? `Ciao ${userName},` : "Ciao,";

  const vars = {
    appName: app_name,
    userName: userName ?? "",
    userEmail: to,
    companyName,
    appUrl,
  };

  const subject = resolveTemplate(
    settings.email_businessapproved_subject,
    `Il tuo account azienda su ${app_name} è stato verificato`,
    vars,
  );
  const bcc = settings.email_businessapproved_bcc ?? undefined;
  const bodyText = resolveTemplate(
    settings.email_businessapproved_body,
    `Buone notizie! La richiesta di verifica per ${companyName} è stata approvata.

Il tuo profilo è ora un account azienda verificato: mostra il badge aziendale, la ragione sociale e il link al sito ufficiale. Da questo momento la community ti riconosce come azienda.`,
    vars,
  );
  const footerText = resolveTemplate(
    settings.email_businessapproved_footer,
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
