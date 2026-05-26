import "server-only";
// lib/modules/notifications/email-channel/renderers/achievement-viral-comments.ts
//
// Email "💬 viral_comments". Subject/body/footer da app_settings
// `modules.notifications.email_achievement_viral_comments_*`.

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

export const achievementViralCommentsRenderer: AchievementEmailRenderer = {
  matchType: "achievement.post_viral_comments",
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
      settings["modules.notifications.email_achievement_viral_comments_subject"],
      `💬 Il tuo post sta facendo discutere — ${totalCount} commenti`,
      vars,
    );
    const bodyText = resolveTemplate(
      settings["modules.notifications.email_achievement_viral_comments_body"],
      `Ciao ${recipient.firstName ?? ""},\n\nIl tuo post ha raccolto ${totalCount} commenti in poche ore. La community vuole confrontarsi con quello che hai scritto — è il momento giusto per rispondere.\n\nRispondere ai commenti è il modo più semplice per tenere viva la conversazione e trasformare lettori occasionali in follower.`,
      vars,
    );
    const footerText = resolveTemplate(
      settings["modules.notifications.email_achievement_viral_comments_footer"],
      `Ricevi questa email perché il tuo post ha superato la soglia virale sui commenti su ${appName}.`,
      vars,
    );

    const ctaLabel = locale === "en" ? "Open the conversation" : "Apri la conversazione";
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
