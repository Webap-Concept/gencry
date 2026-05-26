import "server-only";
// lib/modules/notifications/email-channel/renderers/achievement-viral-comments.ts
//
// Email "💬 Il tuo post sta facendo discutere" per crossing soglia
// commenti. Actor = NULL (evento aggregato).

import { getAppSettings } from "@/lib/db/settings-queries";
import { ctaButton, renderEmail, resolveEmailLogoUrl } from "@/lib/email/layout";
import type { AchievementEmailRenderer, RenderResult, RenderInput } from "../types";
import {
  clipPostPreview,
  greetingFor,
  paragraphHtml,
  postPreviewBox,
} from "./_shared";

export const achievementViralCommentsRenderer: AchievementEmailRenderer = {
  matchType: "achievement.post_viral_comments",
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
      ? `💬 Your post is sparking a conversation — ${totalCount} comments`
      : `💬 Il tuo post sta facendo discutere — ${totalCount} commenti`;

    const greeting = greetingFor(recipient);
    const mainPara = isEn
      ? `Your post just collected <strong>${totalCount}</strong> comments in a few hours. People want to engage with what you wrote — a great moment to jump in and reply. 💬`
      : `Il tuo post ha raccolto <strong>${totalCount}</strong> commenti in poche ore. La community vuole confrontarsi con quello che hai scritto — è il momento giusto per rispondere. 💬`;

    const ctaLabel = isEn ? "Open the conversation" : "Apri la conversazione";

    const contentHtml = [
      `<p style="margin:0 0 14px;color:#374151;font-size:15px;line-height:1.65;">${mainPara}</p>`,
      preview ? postPreviewBox(preview) : "",
      postUrl ? ctaButton(postUrl, ctaLabel) : "",
      paragraphHtml(
        isEn
          ? "Replying to commenters is the simplest way to keep the conversation alive and turn casual readers into engaged followers."
          : "Rispondere ai commenti è il modo più semplice per tenere viva la conversazione e trasformare lettori occasionali in follower.",
      ),
    ].join("");

    const footerText = isEn
      ? `You're receiving this because your post crossed the viral comments threshold on ${appName}.`
      : `Ricevi questa email perché il tuo post ha superato la soglia virale sui commenti su ${appName}.`;

    const html = renderEmail({
      appName,
      logoUrl,
      title: subject,
      greeting,
      contentHtml,
      footerText,
    });

    const text = isEn
      ? `${greeting}\n\nYour post has ${totalCount} comments! 💬\n${preview ? `\n"${preview}"\n` : ""}${postUrl ? `\nOpen the conversation: ${postUrl}\n` : ""}\n— ${appName}`
      : `${greeting}\n\nIl tuo post ha ${totalCount} commenti! 💬\n${preview ? `\n"${preview}"\n` : ""}${postUrl ? `\nApri la conversazione: ${postUrl}\n` : ""}\n— ${appName}`;

    return { subject, html, text };
  },
};
