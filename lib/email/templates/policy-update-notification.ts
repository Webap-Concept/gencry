// lib/email/templates/policy-update-notification.ts
//
// Notifica all'utente che una o più policy di sistema (Termini, Privacy,
// Marketing) sono state aggiornate. Spedita dal cron worker
// `policy-change-notifications` raggruppando per utente: una sola mail
// con tutte le policy aggiornate dello stesso destinatario.
//
// All'utente non viene chiesto di accettare via email — la riaccettazione
// avviene al prossimo accesso, tramite il banner in /(protected)/layout.tsx
// (gentile per gdpr.policy.reconsent_grace_days giorni, poi bloccante).
//
// Il template segue il pattern editabile delle altre email di sistema:
// `resolveTemplate(stored, fallback, vars)` consente di sostituirne
// subject/body/footer da `appSettings` (keys `email_policyupdate_*`).

import type { PolicyNotificationKey } from "@/lib/db/schema";
import { getLocalizedEmailSettings } from "@/lib/email/locale";
import {
  ctaButton,
  paragraphs,
  renderEmail,
  resolveEmailLogoUrl,
} from "@/lib/email/layout";
import { sendEmail } from "@/lib/email/resend";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";

const POLICY_LABELS: Record<PolicyNotificationKey, string> = {
  terms: "Termini di Servizio",
  privacy: "Privacy Policy",
  marketing: "Comunicazioni Marketing",
};

export async function sendPolicyUpdateNotificationEmail(params: {
  toEmail: string;
  policyKeys: PolicyNotificationKey[];
  locale?: Locale;
}) {
  const { toEmail, policyKeys, locale = DEFAULT_LOCALE } = params;
  if (policyKeys.length === 0) return;

  const settings = await getLocalizedEmailSettings(locale);
  const appName = settings.app_name;
  const greeting = "Ciao,";

  const labels = policyKeys.map((k) => POLICY_LABELS[k]);
  const labelsList = formatList(labels);
  const reviewUrl = settings.app_domain
    ? `https://${stripScheme(settings.app_domain)}/`
    : "/";

  const vars = {
    appName,
    userEmail: toEmail,
    policiesList: labelsList,
    policiesCount: String(labels.length),
    reviewLink: reviewUrl,
  };

  const subject = resolveTemplate(
    settings.email_policyupdate_subject ?? null,
    `Abbiamo aggiornato ${labels.length === 1 ? "una policy" : "alcune policy"} — ${appName}`,
    vars,
  );
  const bcc = settings.email_policyupdate_bcc ?? undefined;
  const bodyText = resolveTemplate(
    settings.email_policyupdate_body ?? null,
    `Ti scriviamo per informarti che abbiamo aggiornato ${labelsList === labels[0] ? "la nostra " + labelsList : "le seguenti policy: " + labelsList}.\nAl prossimo accesso a ${appName} ti chiederemo di confermare la nuova versione per continuare a usare il servizio.`,
    vars,
  );
  const footerText = resolveTemplate(
    settings.email_policyupdate_footer ?? null,
    `© ${new Date().getFullYear()} ${appName} · Tutti i diritti riservati`,
    vars,
  );

  const contentHtml = `
    ${paragraphs(bodyText)}
    ${ctaButton(reviewUrl, "Accedi e rivedi le policy")}
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

function formatList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} e ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`;
}

function stripScheme(domain: string): string {
  return domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function resolveTemplate(
  stored: string | null,
  fallback: string,
  vars: Record<string, string>,
): string {
  const tpl = stored?.trim() || fallback;
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
}
