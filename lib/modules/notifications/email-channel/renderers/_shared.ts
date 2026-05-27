import "server-only";
// lib/modules/notifications/email-channel/renderers/_shared.ts
//
// Helper condivisi dai 4 renderer achievement. Niente logica
// type-specific qui — solo HTML escaping + label helpers.

import type { UserMinimal } from "../recipient";

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Prende un nome leggibile per un actor (es. "@mariorossi" o "Mario Rossi").
 * Fallback alla i18n "qualcuno" se actor è null.
 */
export function actorDisplayName(actor: UserMinimal | null, locale: string): string {
  if (!actor) {
    return locale === "en" ? "someone" : "qualcuno";
  }
  if (actor.username) return `@${actor.username}`;
  if (actor.firstName) return actor.firstName;
  return locale === "en" ? "someone" : "qualcuno";
}

/**
 * Saluto in base alla locale + firstName del recipient. Fallback al "Ciao"
 * generico se firstName è null.
 */
export function greetingFor(recipient: UserMinimal): string {
  const isEn = recipient.locale === "en";
  if (recipient.firstName) {
    return isEn ? `Hi ${recipient.firstName},` : `Ciao ${recipient.firstName},`;
  }
  return isEn ? "Hi," : "Ciao,";
}

/** Cap del preview testuale del post nel body email — evita email troppo lunghe. */
export function clipPostPreview(text: string | null | undefined, max = 200): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max - 1).trimEnd() + "…";
}

export function paragraphHtml(text: string): string {
  return `<p style="margin:0 0 14px;color:#374151;font-size:15px;line-height:1.65;">${escapeHtml(text)}</p>`;
}

export function postPreviewBox(preview: string): string {
  return `
<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;">
  <tr>
    <td style="background:#f9fafb;border-left:3px solid #d1d5db;padding:12px 16px;border-radius:0 6px 6px 0;">
      <p style="margin:0;font-size:14px;color:#4b5563;font-style:italic;line-height:1.5;">${escapeHtml(preview)}</p>
    </td>
  </tr>
</table>`;
}

/**
 * Interpolazione Mustache-like `{{token}}` allineata al pattern core
 * (vedi resolveTemplate locale in lib/email/templates/*.ts). Se `stored`
 * è null/empty stringa usa `fallback`. I token mancanti in `vars`
 * restano come `{{key}}` (debug-friendly).
 */
export function resolveTemplate(
  stored: string | null | undefined,
  fallback: string,
  vars: Record<string, string>,
): string {
  const tpl = (stored && stored.trim().length > 0 ? stored : fallback).trim();
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
}
