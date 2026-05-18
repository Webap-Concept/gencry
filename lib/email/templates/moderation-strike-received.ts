// lib/email/templates/moderation-strike-received.ts
//
// Inviata quando un moderatore accetta una segnalazione + emette uno
// strike all'autore (1° o 2°). Il 3° strike usa il template
// moderation-banned (ban automatico via trigger DB).
//
// Vars disponibili nei placeholder {{}}:
//   - appName        nome app
//   - userName       nome dell'utente (saluto), può essere ""
//   - strikeNumber   1 o 2
//   - reason         reason key (es. "spam", "abuse")
//   - sourceType     "post" o "comment"
//   - sourcePreview  primi 200 char del contenuto rimosso
//   - appUrl         base URL
import { getLocalizedEmailSettings } from "@/lib/email/locale";
import {
  paragraphs,
  renderEmail,
  resolveEmailLogoUrl,
} from "@/lib/email/layout";
import { sendEmail } from "@/lib/email/resend";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";

export async function sendModerationStrikeReceivedEmail(params: {
  to: string;
  userName?: string;
  strikeNumber: number;
  reason: string;
  sourceType: "post" | "comment";
  sourcePreview: string | null;
  locale?: Locale;
}) {
  const {
    to,
    userName,
    strikeNumber,
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
    strikeNumber: String(strikeNumber),
    reason,
    sourceType,
    sourcePreview: sourcePreview ?? "",
    appUrl,
  };

  const subject = resolveTemplate(
    settings.email_modstrike_subject,
    `Avviso di moderazione su ${app_name} (${strikeNumber}/3)`,
    vars,
  );
  const bcc = settings.email_modstrike_bcc ?? undefined;
  const bodyText = resolveTemplate(
    settings.email_modstrike_body,
    `Un nostro moderatore ha esaminato una segnalazione su un tuo ${sourceType === "post" ? "post" : "commento"} e l'ha accettata. Il contenuto è stato rimosso e hai ricevuto uno strike di moderazione.

Strike attivi sul tuo account: ${strikeNumber}/3.
Motivo: ${reason}.

Al raggiungimento di 3 strike attivi l'account viene sospeso automaticamente. Ti invitiamo a rivedere le linee guida della community per evitare ulteriori violazioni.`,
    vars,
  );
  const footerText = resolveTemplate(
    settings.email_modstrike_footer,
    `© ${new Date().getFullYear()} ${app_name} · Email automatica, non rispondere a questo indirizzo`,
    vars,
  );

  const previewBlock = sourcePreview
    ? `<blockquote style="margin:16px 0;padding:8px 12px;border-left:3px solid #e5a948;color:#666;font-style:italic;">${escapeHtml(sourcePreview)}</blockquote>`
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
