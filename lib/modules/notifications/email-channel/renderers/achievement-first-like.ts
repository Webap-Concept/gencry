import "server-only";
// lib/modules/notifications/email-channel/renderers/achievement-first-like.ts
//
// Email "🎉 Il tuo post ha ricevuto la prima reazione". Actor = utente
// reale (chi ha messo la prima reazione). Body include preview del post +
// CTA al post.

import { getAppSettings } from "@/lib/db/settings-queries";
import { ctaButton, renderEmail, resolveEmailLogoUrl } from "@/lib/email/layout";
import type { AchievementEmailRenderer, RenderResult, RenderInput } from "../types";
import {
  actorDisplayName,
  clipPostPreview,
  escapeHtml,
  greetingFor,
  paragraphHtml,
  postPreviewBox,
} from "./_shared";

export const achievementFirstLikeRenderer: AchievementEmailRenderer = {
  matchType: "achievement.first_like",
  async render({ notification, recipient, actor, postUrl }: RenderInput): Promise<RenderResult> {
    const settings = await getAppSettings();
    const appName = settings.app_name ?? "Generazione Crypto";
    const logoUrl = resolveEmailLogoUrl(settings);
    const isEn = recipient.locale === "en";

    const actorName = actorDisplayName(actor, recipient.locale);
    const payload = (notification.payload ?? {}) as Record<string, unknown>;
    const preview = clipPostPreview(
      typeof payload.post_preview === "string" ? (payload.post_preview as string) : null,
    );

    const subject = isEn
      ? `🎉 ${actorName} just reacted to your post`
      : `🎉 ${actorName} ha messo la prima reazione al tuo post`;

    const greeting = greetingFor(recipient);
    const mainPara = isEn
      ? `<strong>${escapeHtml(actorName)}</strong> just gave your post its very first reaction — congratulations on getting the conversation going! 🎉`
      : `<strong>${escapeHtml(actorName)}</strong> ha appena messo la prima reazione al tuo post — complimenti, hai iniziato la conversazione! 🎉`;

    const ctaLabel = isEn ? "View your post" : "Apri il tuo post";

    const contentHtml = [
      `<p style="margin:0 0 14px;color:#374151;font-size:15px;line-height:1.65;">${mainPara}</p>`,
      preview ? postPreviewBox(preview) : "",
      postUrl ? ctaButton(postUrl, ctaLabel) : "",
      paragraphHtml(
        isEn
          ? "Keep posting — every reaction is a signal that your voice matters in the community."
          : "Continua a postare — ogni reazione è un segnale che la tua voce conta nella community.",
      ),
    ].join("");

    const footerText = isEn
      ? `You're receiving this because you're a member of ${appName}.`
      : `Ricevi questa email perché sei iscritto a ${appName}.`;

    const html = renderEmail({
      appName,
      logoUrl,
      title: subject,
      greeting,
      contentHtml,
      footerText,
    });

    const text = isEn
      ? `${greeting}\n\n${actorName} just gave your post its first reaction! 🎉\n${preview ? `\n"${preview}"\n` : ""}${postUrl ? `\nOpen the post: ${postUrl}\n` : ""}\n— ${appName}`
      : `${greeting}\n\n${actorName} ha messo la prima reazione al tuo post! 🎉\n${preview ? `\n"${preview}"\n` : ""}${postUrl ? `\nApri il post: ${postUrl}\n` : ""}\n— ${appName}`;

    return { subject, html, text };
  },
};
