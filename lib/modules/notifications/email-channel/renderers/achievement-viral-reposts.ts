import "server-only";
// lib/modules/notifications/email-channel/renderers/achievement-viral-reposts.ts
//
// Email "🔁 Il tuo post viene citato molto" per crossing soglia repost.
// Actor = NULL (evento aggregato).

import { getAppSettings } from "@/lib/db/settings-queries";
import { ctaButton, renderEmail, resolveEmailLogoUrl } from "@/lib/email/layout";
import type { AchievementEmailRenderer, RenderResult, RenderInput } from "../types";
import {
  clipPostPreview,
  greetingFor,
  paragraphHtml,
  postPreviewBox,
} from "./_shared";

export const achievementViralRepostsRenderer: AchievementEmailRenderer = {
  matchType: "achievement.post_viral_reposts",
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
      ? `🔁 Your post is being widely shared — ${totalCount} reposts`
      : `🔁 Il tuo post viene citato molto — ${totalCount} repost`;

    const greeting = greetingFor(recipient);
    const mainPara = isEn
      ? `Your post has been quoted by <strong>${totalCount}</strong> people in just a few hours. Reposts are the strongest signal that your idea is spreading. 🔁`
      : `Il tuo post è stato citato da <strong>${totalCount}</strong> persone in poche ore. Il repost è il segnale più forte che la tua idea si sta diffondendo. 🔁`;

    const ctaLabel = isEn ? "Open your post" : "Apri il tuo post";

    const contentHtml = [
      `<p style="margin:0 0 14px;color:#374151;font-size:15px;line-height:1.65;">${mainPara}</p>`,
      preview ? postPreviewBox(preview) : "",
      postUrl ? ctaButton(postUrl, ctaLabel) : "",
      paragraphHtml(
        isEn
          ? "Check the reposts to see how other voices are framing your idea — there may be follow-ups worth replying to."
          : "Apri i repost per vedere come altre voci stanno rilanciando la tua idea — potrebbero esserci riprese a cui vale la pena rispondere.",
      ),
    ].join("");

    const footerText = isEn
      ? `You're receiving this because your post crossed the viral reposts threshold on ${appName}.`
      : `Ricevi questa email perché il tuo post ha superato la soglia virale sui repost su ${appName}.`;

    const html = renderEmail({
      appName,
      logoUrl,
      title: subject,
      greeting,
      contentHtml,
      footerText,
    });

    const text = isEn
      ? `${greeting}\n\nYour post has been reposted ${totalCount} times! 🔁\n${preview ? `\n"${preview}"\n` : ""}${postUrl ? `\nOpen the post: ${postUrl}\n` : ""}\n— ${appName}`
      : `${greeting}\n\nIl tuo post è stato citato ${totalCount} volte! 🔁\n${preview ? `\n"${preview}"\n` : ""}${postUrl ? `\nApri il post: ${postUrl}\n` : ""}\n— ${appName}`;

    return { subject, html, text };
  },
};
