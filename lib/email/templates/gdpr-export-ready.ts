// lib/email/templates/gdpr-export-ready.ts
import { getLocalizedEmailSettings } from "@/lib/email/locale";
import {
  ctaButton,
  paragraphs,
  renderEmail,
  resolveEmailLogoUrl,
} from "@/lib/email/layout";
import { sendEmail } from "@/lib/email/resend";
import { emailTheme as t } from "@/lib/email/theme";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";

/**
 * Email "I tuoi dati sono pronti per il download" — inviata al termine
 * dell'export GDPR async. Il link è una signed URL temporanea (24h);
 * scaduta, l'utente può rigenerarla da /settings/privacy.
 *
 * Il template segue il pattern editabile delle altre email di sistema:
 * `resolveTemplate(stored, fallback, vars)` consente di sostituirne
 * subject/body/footer da `appSettings` (keys `email_gdprexport_*`).
 * L'UI admin per editarli non è in questa PR — il fallback hard-coded
 * funziona finché non viene salvata una versione custom.
 */
export async function sendGdprExportReadyEmail(params: {
  toEmail: string;
  firstName: string | null;
  downloadUrl: string;
  locale?: Locale;
}) {
  const { toEmail, firstName, downloadUrl, locale = DEFAULT_LOCALE } = params;
  const settings = await getLocalizedEmailSettings(locale);
  const appName = settings.app_name;
  const greeting = firstName ? `Ciao ${firstName},` : "Ciao,";

  const vars = {
    appName,
    userEmail: toEmail,
    userName: firstName ?? "",
    downloadLink: downloadUrl,
  };

  const subject = resolveTemplate(
    settings.email_gdprexport_subject ?? null,
    `I tuoi dati sono pronti — ${appName}`,
    vars,
  );
  const bcc = settings.email_gdprexport_bcc ?? undefined;
  const bodyText = resolveTemplate(
    settings.email_gdprexport_body ?? null,
    `Abbiamo preparato l'archivio dei tuoi dati personali su ${appName}, come da tua richiesta.\nPuoi scaricarlo dal pulsante qui sotto. Il link è valido per 24 ore; se scade, puoi rigenerarlo dalle impostazioni privacy del tuo account.`,
    vars,
  );
  const footerText = resolveTemplate(
    settings.email_gdprexport_footer ?? null,
    `© ${new Date().getFullYear()} ${appName} · Tutti i diritti riservati`,
    vars,
  );

  const contentHtml = `
    ${paragraphs(bodyText)}
    ${ctaButton(downloadUrl, "Scarica i miei dati")}
    <p style="margin:24px 0 16px;color:${t.textLight};font-size:12px;line-height:1.55;">
      Se il pulsante non funziona, copia e incolla questo link nel browser:<br/>
      <a href="${downloadUrl}" style="color:${t.brandPrimary};word-break:break-all;">${downloadUrl}</a>
    </p>
    <p style="margin:0;color:${t.textLight};font-size:13px;line-height:1.55;">
      Se non hai richiesto questa esportazione, ignora questa email e considera di
      cambiare la password del tuo account.
    </p>
  `;

  await sendEmail({
    to: toEmail,
    bcc,
    subject,
    html: renderEmail({
      appName,
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
