// lib/email/templates/user-deleted.ts
import { getAppSettings } from "@/lib/db/settings-queries";
import {
  infoBox,
  paragraphs,
  renderEmail,
  resolveEmailLogoUrl,
} from "@/lib/email/layout";
import { sendEmail } from "@/lib/email/resend";

export async function sendUserDeletedEmail(
  to: string,
  firstName: string | null,
  deletedAt: Date,
) {
  const settings = await getAppSettings();
  const { app_name } = settings;
  const greeting = firstName ? `Ciao ${firstName},` : "Ciao,";
  const formattedDate = deletedAt.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const vars = {
    appName: app_name,
    userEmail: to,
    userName: firstName ?? "",
    deletedDate: formattedDate,
  };

  const subject = resolveTemplate(
    settings.email_deleted_subject,
    `Il tuo account è stato eliminato — ${app_name}`,
    vars,
  );
  const bcc = settings.email_deleted_bcc ?? undefined;
  const bodyText = resolveTemplate(
    settings.email_deleted_body,
    `Ti informiamo che il tuo account ${app_name} è stato eliminato definitivamente in data ${formattedDate} da un amministratore della piattaforma.\n\nI tuoi dati personali sono stati rimossi dai sistemi attivi. Se ritieni che questa operazione sia avvenuta per errore, contatta il nostro supporto.`,
    vars,
  );
  const footerText = resolveTemplate(
    settings.email_deleted_footer,
    `© ${new Date().getFullYear()} ${app_name} · Tutti i diritti riservati`,
    vars,
  );

  const contentHtml = `
    ${paragraphs(bodyText)}
    ${infoBox(
      "Se non riconosci questa operazione, contatta il supporto rispondendo a questa email.",
      "danger",
    )}
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
