import "server-only";
// lib/modules/notifications/email-channel/renderers/achievement-viral-reposts.ts
//
// Email "🔁 viral_reposts". Subject/body/footer da app_settings
// `modules.notifications.email_achievement_viral_reposts_*`.

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

export const achievementViralRepostsRenderer: AchievementEmailRenderer = {
  matchType: "achievement.post_viral_reposts",
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
      settings["modules.notifications.email_achievement_viral_reposts_subject"],
      `🔁 Il tuo post viene citato molto — ${totalCount} repost`,
      vars,
    );
    const bodyText = resolveTemplate(
      settings["modules.notifications.email_achievement_viral_reposts_body"],
      `Ciao ${recipient.firstName ?? ""},\n\nIl tuo post è stato citato da ${totalCount} persone in poche ore. Il repost è il segnale più forte che la tua idea si sta diffondendo.\n\nApri i repost per vedere come altre voci stanno rilanciando la tua idea — potrebbero esserci riprese a cui vale la pena rispondere.`,
      vars,
    );
    const footerText = resolveTemplate(
      settings["modules.notifications.email_achievement_viral_reposts_footer"],
      `Ricevi questa email perché il tuo post ha superato la soglia virale sui repost su ${appName}.`,
      vars,
    );

    const ctaLabel = locale === "en" ? "Open your post" : "Apri il tuo post";
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
