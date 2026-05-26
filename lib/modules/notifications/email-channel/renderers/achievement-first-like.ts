import "server-only";
// lib/modules/notifications/email-channel/renderers/achievement-first-like.ts
//
// Email "🎉 prima reazione". Subject/body/footer letti da app_settings
// `modules.notifications.email_achievement_first_like_*` con overlay
// per locale non-default via tabella translations (namespace `email`).
// Placeholder Mustache `{{token}}` interpolati da resolveTemplate.

import { getLocalizedEmailSettings } from "@/lib/email/locale";
import { ctaButton, paragraphs, renderEmail, resolveEmailLogoUrl } from "@/lib/email/layout";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import type { AchievementEmailRenderer, RenderInput, RenderResult } from "../types";
import {
  actorDisplayName,
  clipPostPreview,
  greetingFor,
  postPreviewBox,
  resolveTemplate,
} from "./_shared";

export const achievementFirstLikeRenderer: AchievementEmailRenderer = {
  matchType: "achievement.first_like",
  async render({ notification, recipient, actor, postUrl }: RenderInput): Promise<RenderResult> {
    const locale: Locale = (recipient.locale as Locale) || DEFAULT_LOCALE;
    const settings = await getLocalizedEmailSettings(locale);
    const appName = settings.app_name ?? "Generazione Crypto";
    const logoUrl = resolveEmailLogoUrl(settings);

    const actorName = actorDisplayName(actor, locale);
    const payload = (notification.payload ?? {}) as Record<string, unknown>;
    const preview = clipPostPreview(
      typeof payload.post_preview === "string" ? (payload.post_preview as string) : null,
    );

    const vars: Record<string, string> = {
      appName,
      userName: recipient.firstName ?? "",
      userEmail: recipient.email,
      actorName,
      postUrl: postUrl ?? "",
      postPreview: preview ?? "",
    };

    const subject = resolveTemplate(
      settings["modules.notifications.email_achievement_first_like_subject"],
      `🎉 ${actorName} ha messo la prima reazione al tuo post`,
      vars,
    );
    const bodyText = resolveTemplate(
      settings["modules.notifications.email_achievement_first_like_body"],
      `Ciao ${recipient.firstName ?? ""},\n\n${actorName} ha appena messo la prima reazione al tuo post — complimenti, hai iniziato la conversazione!\n\nContinua a postare: ogni reazione è un segnale che la tua voce conta nella community.`,
      vars,
    );
    const footerText = resolveTemplate(
      settings["modules.notifications.email_achievement_first_like_footer"],
      `Ricevi questa email perché sei iscritto a ${appName}.`,
      vars,
    );

    const ctaLabel = locale === "en" ? "View your post" : "Apri il tuo post";
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
