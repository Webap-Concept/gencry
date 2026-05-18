// lib/email/templates/moderation-banned.ts
//
// Inviata quando il 3° strike triggera il ban automatico (trigger DB
// users_strikes_sync_count_trg setta users.banned_at). Il login viene
// rifiutato con un messaggio i18n; questa email spiega all'utente cosa
// è successo e come ricorrere.
//
// Vars disponibili: appName, userName, reason, sourceType, sourcePreview, appUrl.
import { getLocalizedEmailSettings } from "@/lib/email/locale";
import {
  paragraphs,
  renderEmail,
  resolveEmailLogoUrl,
} from "@/lib/email/layout";
import { sendEmail } from "@/lib/email/resend";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";

export async function sendModerationBannedEmail(params: {
  to: string;
  userName?: string;
  reason: string;
  sourceType: "post" | "comment";
  sourcePreview: string | null;
  locale?: Locale;
}) {
  const {
    to,
    userName,
    reason,
    sourceType,
    sourcePreview,
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
    reason,
    sourceType,
    sourcePreview: sourcePreview ?? "",
    appUrl,
  };

  const subject = resolveTemplate(
    settings.email_modbanned_subject,
    `Il tuo account ${app_name} è stato sospeso`,
    vars,
  );
  const bcc = settings.email_modbanned_bcc ?? undefined;
  const bodyText = resolveTemplate(
    settings.email_modbanned_body,
    `A seguito di tre strike di moderazione accumulati, il tuo account su ${app_name} è stato sospeso e non puoi più accedere alla piattaforma.

L'ultimo ${sourceType === "post" ? "post" : "commento"} che ha innescato la sospensione è stato rimosso. Motivo finale: ${reason}.

Se ritieni che la decisione sia ingiusta puoi contattare il supporto rispondendo a questa email o scrivendo dal modulo di contatto sul sito.`,
    vars,
  );
  const footerText = resolveTemplate(
    settings.email_modbanned_footer,
    `© ${new Date().getFullYear()} ${app_name} · Email automatica, non rispondere a questo indirizzo`,
    vars,
  );

  const previewBlock = sourcePreview
    ? `<blockquote style="margin:16px 0;padding:8px 12px;border-left:3px solid #dc2626;color:#666;font-style:italic;">${escapeHtml(sourcePreview)}</blockquote>`
    : "";

  const contentHtml = `
    ${paragraphs(bodyText)}
    ${previewBlock}
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
