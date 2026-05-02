// lib/email/templates/account-deletion-requested.ts
import { getAppSettings } from "@/lib/db/settings-queries";
import {
  paragraphs,
  renderEmail,
  resolveEmailLogoUrl,
} from "@/lib/email/layout";
import { sendEmail } from "@/lib/email/resend";
import { emailTheme as t } from "@/lib/email/theme";

/**
 * Email "Hai richiesto l'eliminazione del tuo account" — inviata subito
 * dopo che l'utente conferma la deletion da /settings/privacy.
 * Contenuto: conferma, data esatta del purge, invito a contattare
 * l'assistenza per annullare entro la grace period.
 *
 * Best-effort dal chiamante: se Resend fallisce, la deletion è già
 * registrata in DB — l'email è solo conferma. Il chiamante deve
 * try/catch silenzioso per non fallire la richiesta utente.
 */
export async function sendAccountDeletionRequestedEmail(params: {
  toEmail: string;
  firstName: string | null;
  /** Data del purge fisico (deletedAt + 30 giorni). */
  purgeDate: Date;
}) {
  const { toEmail, firstName, purgeDate } = params;
  const settings = await getAppSettings();
  const appName = settings.app_name;
  const greeting = firstName ? `Ciao ${firstName},` : "Ciao,";

  const purgeDateLabel = purgeDate.toLocaleDateString("it-IT", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const vars = {
    appName,
    userEmail: toEmail,
    userName: firstName ?? "",
    purgeDate: purgeDateLabel,
  };

  const subject = resolveTemplate(
    settings.email_accountdeletion_subject ?? null,
    `Conferma richiesta di eliminazione account — ${appName}`,
    vars,
  );
  const bcc = settings.email_accountdeletion_bcc ?? undefined;
  const bodyText = resolveTemplate(
    settings.email_accountdeletion_body ?? null,
    `Abbiamo ricevuto la tua richiesta di eliminazione dell'account su ${appName}. I tuoi dati personali saranno cancellati definitivamente il ${purgeDateLabel}.\nFino a quel momento puoi annullare la richiesta scrivendo all'assistenza. Dopo il purge non sarà più possibile recuperare i dati.`,
    vars,
  );
  const footerText = resolveTemplate(
    settings.email_accountdeletion_footer ?? null,
    `© ${new Date().getFullYear()} ${appName} · Tutti i diritti riservati`,
    vars,
  );

  const contentHtml = `
    ${paragraphs(bodyText)}
    <p style="margin:24px 0 0;color:${t.textLight};font-size:13px;line-height:1.55;">
      Se non sei stato tu a richiedere questa eliminazione, contatta
      immediatamente l'assistenza e cambia la password del tuo account.
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
