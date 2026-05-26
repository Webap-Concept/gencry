// app/(admin)/admin/modules/notifications/templates/page.tsx
//
// Form admin per editare i 4 template email achievement (subject +
// body + footer ciascuno). V1 solo locale default (it). Le keys
// vivono in app_settings sotto namespace modules.notifications.email_*.
// I valori salvati arrivano ai renderer via getLocalizedEmailSettings
// + resolveTemplate (mustache `{{token}}`).
//
// Pattern: tab core /admin/settings → "Email templates" gestisce le
// email del core. Quella di qui è la versione MODULE-OWNED — coerente
// con feedback_module_isolation.
import type { Metadata } from "next";
import { getAppSettings } from "@/lib/db/settings-queries";
import { TemplatesForm } from "./_components/templates-form";

export const metadata: Metadata = { title: "Notifications / Templates" };
export const dynamic = "force-dynamic";

export default async function NotificationsTemplatesPage() {
  const settings = await getAppSettings();
  return (
    <TemplatesForm
      initial={{
        firstLikeSubject: settings["modules.notifications.email_achievement_first_like_subject"] ?? "",
        firstLikeBody: settings["modules.notifications.email_achievement_first_like_body"] ?? "",
        firstLikeFooter: settings["modules.notifications.email_achievement_first_like_footer"] ?? "",
        viralLikesSubject: settings["modules.notifications.email_achievement_viral_likes_subject"] ?? "",
        viralLikesBody: settings["modules.notifications.email_achievement_viral_likes_body"] ?? "",
        viralLikesFooter: settings["modules.notifications.email_achievement_viral_likes_footer"] ?? "",
        viralCommentsSubject: settings["modules.notifications.email_achievement_viral_comments_subject"] ?? "",
        viralCommentsBody: settings["modules.notifications.email_achievement_viral_comments_body"] ?? "",
        viralCommentsFooter: settings["modules.notifications.email_achievement_viral_comments_footer"] ?? "",
        viralRepostsSubject: settings["modules.notifications.email_achievement_viral_reposts_subject"] ?? "",
        viralRepostsBody: settings["modules.notifications.email_achievement_viral_reposts_body"] ?? "",
        viralRepostsFooter: settings["modules.notifications.email_achievement_viral_reposts_footer"] ?? "",
      }}
    />
  );
}
