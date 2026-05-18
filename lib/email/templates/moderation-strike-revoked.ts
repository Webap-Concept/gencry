// lib/email/templates/moderation-strike-revoked.ts
//
// Inviata quando un moderatore revoca uno strike. Se la revoca riporta
// il counter sotto 3, il trigger DB solleva automaticamente il ban
// (banned_at = NULL): in quel caso `unbanned` = true e il body lo
// menziona — il login ricomincia a funzionare.
//
// Vars disponibili: appName, userName, activeCountAfter, unbanned, appUrl.
import { getLocalizedEmailSettings } from "@/lib/email/locale";
import {
  paragraphs,
  renderEmail,
  resolveEmailLogoUrl,
} from "@/lib/email/layout";
import { sendEmail } from "@/lib/email/resend";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";

export async function sendModerationStrikeRevokedEmail(params: {
  to: string;
  userName?: string;
  activeCountAfter: number;
  unbanned: boolean;
  locale?: Locale;
}) {
  const {
    to,
    userName,
    activeCountAfter,
    unbanned,
    locale = DEFAULT_LOCALE,
  } = params;
  const settings = await getLocalizedEmailSettings(locale);
  const { app_name } = settings;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const greeting = userName ? `Ciao ${userName},` : "Ciao,";

  const vars = {
    appName: app_name,
    userName: userName ?? "",
    userEmail: to,
    activeCountAfter: String(activeCountAfter),
    unbanned: unbanned ? "true" : "false",
    appUrl,
  };

  const subject = resolveTemplate(
    settings.email_modstrikerevoked_subject,
    unbanned
      ? `Il tuo account ${app_name} è stato riattivato`
      : `Uno strike è stato revocato sul tuo account ${app_name}`,
    vars,
  );
  const bcc = settings.email_modstrikerevoked_bcc ?? undefined;
  const bodyText = resolveTemplate(
    settings.email_modstrikerevoked_body,
    unbanned
      ? `Un nostro moderatore ha revocato uno dei tuoi strike e di conseguenza la sospensione del tuo account è stata sollevata. Puoi tornare ad accedere normalmente.

Strike attivi residui: ${activeCountAfter}/3.`
      : `Un nostro moderatore ha revocato uno dei tuoi strike dopo una revisione del caso.

Strike attivi residui: ${activeCountAfter}/3.`,
    vars,
  );
  const footerText = resolveTemplate(
    settings.email_modstrikerevoked_footer,
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
