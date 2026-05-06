// lib/email/templates/waiting-list.ts
// Email di conferma iscrizione alla waiting list (landing coming-soon).

import { getLocalizedEmailSettings } from "@/lib/email/locale";
import {
  paragraphs,
  renderEmail,
  resolveEmailLogoUrl,
} from "@/lib/email/layout";
import { sendEmail } from "@/lib/email/resend";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";

export async function sendWaitingListEmail(
  to: string,
  locale: Locale = DEFAULT_LOCALE,
) {
  const settings = await getLocalizedEmailSettings(locale);
  const { app_name } = settings;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  const vars = { appName: app_name, userEmail: to, appUrl };

  const subject = resolveTemplate(
    settings.email_waitinglist_subject,
    `Sei nella waiting list di ${app_name}`,
    vars,
  );
  const bcc = settings.email_waitinglist_bcc ?? undefined;
  const bodyText = resolveTemplate(
    settings.email_waitinglist_body,
    `Ciao,\n\nGrazie per esserti iscritto alla waiting list di ${app_name}.\n\nSei tra i primi a sapere quando apriremo le porte: ti scriveremo non appena saremo pronti.\n\nA presto.`,
    vars,
  );
  const footerText = resolveTemplate(
    settings.email_waitinglist_footer,
    `© ${new Date().getFullYear()} ${app_name}`,
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
