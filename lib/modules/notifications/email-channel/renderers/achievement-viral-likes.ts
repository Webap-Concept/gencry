import "server-only";
// lib/modules/notifications/email-channel/renderers/achievement-viral-likes.ts
//
// Email "🚀 viral_likes". Subject/body/footer da app_settings
// `modules.notifications.email_achievement_viral_likes_*`.

import { getLocalizedEmailSettings } from "@/lib/email/locale";
import { ctaButton, paragraphs, renderEmail, resolveEmailLogoUrl } from "@/lib/email/layout";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import type { AchievementEmailRenderer, RenderInput, RenderResult } from "../types";
import {
  clipPostPreview,
  greetingFor,
  postPreviewBox,
  resolveTemplate,
} from "./_shared";

export const achievementViralLikesRenderer: AchievementEmailRenderer = {
  matchType: "achievement.post_viral_likes",
  async render({ notification, recipient, postUrl }: RenderInput): Promise<RenderResult> {
    const locale: Locale = (recipient.locale as Locale) || DEFAULT_LOCALE;
    const settings = await getLocalizedEmailSettings(locale);
    const appName = settings.app_name ?? "Generazione Crypto";
    const logoUrl = resolveEmailLogoUrl(settings);

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

    const vars: Record<string, string> = {
      appName,
      userName: recipient.firstName ?? "",
      userEmail: recipient.email,
      totalCount: String(totalCount),
      postUrl: postUrl ?? "",
      postPreview: preview ?? "",
    };

    const subject = resolveTemplate(
      settings["modules.notifications.email_achievement_viral_likes_subject"],
      `🚀 Il tuo post sta andando virale — ${totalCount} reazioni`,
      vars,
    );
    const bodyText = resolveTemplate(
      settings["modules.notifications.email_achievement_viral_likes_body"],
      `Ciao ${recipient.firstName ?? ""},\n\nIl tuo post ha appena raggiunto ${totalCount} reazioni in poche ore. È la community che ti dice che l'argomento risuona — continua così!\n\nPensa di approfondire con un post di follow-up: il momentum è dalla tua parte.`,
      vars,
    );
    const footerText = resolveTemplate(
      settings["modules.notifications.email_achievement_viral_likes_footer"],
      `Ricevi questa email perché il tuo post ha superato la soglia virale su ${appName}.`,
      vars,
    );

    const ctaLabel = locale === "en" ? "Open your viral post" : "Apri il tuo post virale";
    const greeting = greetingFor(recipient);

    const contentHtml = [
      paragraphs(bodyText),
      preview ? postPreviewBox(preview) : "",
      postUrl ? ctaButton(postUrl, ctaLabel) : "",
    ].join("");

    const html = renderEmail({
      appName,
      logoUrl,
      title: subject,
      greeting,
      contentHtml,
      footerText,
    });

    return { subject, html };
  },
};
