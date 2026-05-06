// lib/email/templates/welcome.ts
import { getLocalizedEmailSettings } from "@/lib/email/locale";
import {
  ctaButton,
  paragraphs,
  renderEmail,
  resolveEmailLogoUrl,
} from "@/lib/email/layout";
import { sendEmail } from "@/lib/email/resend";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";

export async function sendWelcomeEmail(
  to: string,
  userName?: string,
  locale: Locale = DEFAULT_LOCALE,
) {
  const settings = await getLocalizedEmailSettings(locale);
  const { app_name } = settings;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const greeting = userName ? `Ciao ${userName},` : "Ciao,";

  const vars = {
    appName: app_name,
    userEmail: to,
    userName: userName ?? "",
    appUrl,
  };

  const subject = resolveTemplate(
    settings.email_welcome_subject,
    `Benvenuto in ${app_name}`,
    vars,
  );
  const bcc = settings.email_welcome_bcc ?? undefined;
  const bodyText = resolveTemplate(
    settings.email_welcome_body,
    `Benvenuto in ${app_name}! Il tuo account è stato creato con successo.`,
    vars,
  );
  const footerText = resolveTemplate(
    settings.email_welcome_footer,
    `© ${new Date().getFullYear()} ${app_name} · Tutti i diritti riservati`,
    vars,
  );

  const contentHtml = `
    ${paragraphs(bodyText)}
    ${appUrl ? ctaButton(appUrl, "Accedi alla piattaforma") : ""}
  `;

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
