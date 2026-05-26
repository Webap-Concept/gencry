import "server-only";
// lib/modules/notifications/email-channel/renderers/achievement-viral-likes.ts
//
// Email "🚀 Il tuo post sta andando virale" per crossing soglia
// reactions. Actor = NULL (evento aggregato). Body include il count
// raggiunto + CTA al post.

import { getAppSettings } from "@/lib/db/settings-queries";
import { ctaButton, renderEmail, resolveEmailLogoUrl } from "@/lib/email/layout";
import type { AchievementEmailRenderer, RenderResult, RenderInput } from "../types";
import {
  clipPostPreview,
  greetingFor,
  paragraphHtml,
  postPreviewBox,
} from "./_shared";

export const achievementViralLikesRenderer: AchievementEmailRenderer = {
  matchType: "achievement.post_viral_likes",
  async render({ notification, recipient, postUrl }: RenderInput): Promise<RenderResult> {
    const settings = await getAppSettings();
    const appName = settings.app_name ?? "Generazione Crypto";
    const logoUrl = resolveEmailLogoUrl(settings);
    const isEn = recipient.locale === "en";

    const payload = (notification.payload ?? {}) as Record<string, unknown>;
    const totalCount =
      typeof payload.total_count === "number"
        ? payload.total_count
        : typeof payload.total_count === "string"
          ? parseInt(payload.total_count, 10)
          : 0;
    const preview = clipPostPreview(
      typeof payload.post_preview === "string" ? (payload.post_preview as string) : null,
    );

    const subject = isEn
      ? `🚀 Your post is going viral — ${totalCount} reactions`
      : `🚀 Il tuo post sta andando virale — ${totalCount} reazioni`;

    const greeting = greetingFor(recipient);
    const mainPara = isEn
      ? `Your post just hit <strong>${totalCount}</strong> reactions in a few hours. That's the community telling you the topic resonates — keep going! 🚀`
      : `Il tuo post ha appena raggiunto <strong>${totalCount}</strong> reazioni in poche ore. È la community che ti dice che l'argomento risuona — continua così! 🚀`;

    const ctaLabel = isEn ? "Open your viral post" : "Apri il tuo post virale";

    const contentHtml = [
      `<p style="margin:0 0 14px;color:#374151;font-size:15px;line-height:1.65;">${mainPara}</p>`,
      preview ? postPreviewBox(preview) : "",
      postUrl ? ctaButton(postUrl, ctaLabel) : "",
      paragraphHtml(
        isEn
          ? "Consider sharing your perspective with a follow-up post — momentum is on your side right now."
          : "Pensa di approfondire con un post di follow-up — il momentum è dalla tua parte.",
      ),
    ].join("");

    const footerText = isEn
      ? `You're receiving this because your post crossed the viral threshold on ${appName}.`
      : `Ricevi questa email perché il tuo post ha superato la soglia virale su ${appName}.`;

    const html = renderEmail({
      appName,
      logoUrl,
      title: subject,
      greeting,
      contentHtml,
      footerText,
    });

    const text = isEn
      ? `${greeting}\n\nYour post just hit ${totalCount} reactions! 🚀\n${preview ? `\n"${preview}"\n` : ""}${postUrl ? `\nOpen the post: ${postUrl}\n` : ""}\n— ${appName}`
      : `${greeting}\n\nIl tuo post ha raggiunto ${totalCount} reazioni! 🚀\n${preview ? `\n"${preview}"\n` : ""}${postUrl ? `\nApri il post: ${postUrl}\n` : ""}\n— ${appName}`;

    return { subject, html, text };
  },
};
