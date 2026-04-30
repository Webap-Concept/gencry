// lib/email/layout.ts
//
// Layout HTML condiviso per le email transazionali. Tutti i template
// (welcome, signup-verification, password-reset, user-deleted, waiting-list)
// passano contentHtml + footerText e qui costruiamo header (logo o nome app),
// corpo e footer.
//
// Nota: niente immagini di sfondo, niente Flexbox/Grid — solo layout a tabella
// per massima compatibilità con i client email (Outlook, Gmail, Apple Mail).

import type { AppSettings } from "@/lib/db/settings-queries";
import { emailTheme as t } from "@/lib/email/theme";

export type EmailLogoChoice = "logo" | "logo-variant" | "none";

export function resolveEmailLogoUrl(settings: AppSettings): string | null {
  const choice = (settings.email_logo_choice as EmailLogoChoice) ?? "logo";
  if (choice === "none") return null;
  if (choice === "logo-variant") {
    return settings.app_logo_variant_url ?? settings.app_logo_url ?? null;
  }
  return settings.app_logo_url ?? null;
}

/**
 * Trasforma testo plain con \n in paragrafi <p>. Le righe vuote separano
 * paragrafi. Usato dai template che salvano body come testo libero.
 */
export function paragraphs(text: string): string {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map(
      (l) =>
        `<p style="margin:0 0 14px;color:${t.textMuted};font-size:15px;line-height:1.65;">${l}</p>`,
    )
    .join("");
}

export function ctaButton(href: string, label: string): string {
  return `
<table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 8px;">
  <tr>
    <td align="center">
      <a href="${href}"
        style="display:inline-block;background:${t.brandPrimary};color:${t.textInverse};font-size:15px;font-weight:600;text-decoration:none;padding:14px 36px;border-radius:8px;">
        ${label}
      </a>
    </td>
  </tr>
</table>`;
}

export function otpCard(label: string, code: string): string {
  return `
<table width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;">
  <tr>
    <td align="center">
      <div style="display:inline-block;background:${t.brandAccentLight};border:1px solid ${t.brandAccent};border-radius:12px;padding:20px 40px;">
        <p style="margin:0 0 6px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;color:${t.textMuted};">${label}</p>
        <p style="margin:0;font-size:32px;font-weight:700;letter-spacing:0.25em;color:${t.brandPrimary};font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${code}</p>
      </div>
    </td>
  </tr>
</table>`;
}

export function infoBox(
  message: string,
  variant: "info" | "danger" = "info",
): string {
  const palette =
    variant === "danger"
      ? { bg: "#fff5f5", border: "#fecaca", text: "#b91c1c" }
      : { bg: t.brandAccentLight, border: t.brandAccent, text: t.textPrimary };
  return `
<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0 0;">
  <tr>
    <td style="background:${palette.bg};border:1px solid ${palette.border};border-radius:8px;padding:14px 16px;">
      <p style="margin:0;font-size:13px;color:${palette.text};line-height:1.55;">${message}</p>
    </td>
  </tr>
</table>`;
}

/**
 * Builds the full HTML email document. Header shows logo (if configured)
 * or app name fallback. Body is contentHtml. Footer is plain text.
 */
export function renderEmail({
  appName,
  logoUrl,
  title,
  greeting,
  contentHtml,
  footerText,
}: {
  appName: string;
  logoUrl: string | null;
  title: string;
  greeting?: string;
  contentHtml: string;
  footerText: string;
}): string {
  const headerInner = logoUrl
    ? `<img src="${logoUrl}" alt="${escapeAttr(appName)}" height="40"
          style="display:block;height:100px;width:auto;border:0;outline:none;text-decoration:none;" />`
    : `<span style="font-size:20px;font-weight:700;letter-spacing:-0.3px;color:${t.textPrimary};">${appName}</span>`;

  const greetingHtml = greeting
    ? `<p style="margin:0 0 12px;color:${t.textPrimary};font-size:17px;font-weight:600;">${greeting}</p>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="x-apple-disable-message-reformatting" />
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:${t.bgPage};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${t.textPrimary};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
    style="background:${t.bgPage};padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0"
          style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.04),0 4px 12px rgba(0,0,0,0.04);">
          <!-- Header -->
          <tr>
            <td align="center" style="padding:28px 40px 20px;border-bottom:1px solid ${t.border};">
              ${headerInner}
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px 40px 36px;">
              ${greetingHtml}
              ${contentHtml}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td align="center" style="background:${t.bgPage};padding:18px 40px;border-top:1px solid ${t.border};">
              <p style="margin:0;color:${t.textLight};font-size:12px;line-height:1.5;">${footerText}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}
