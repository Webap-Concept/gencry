"use server";
// app/(admin)/admin/modules/notifications/email/actions.ts
//
// Save dei 4 template achievement email. V1 gestisce solo la locale
// di default (it) salvata in `app_settings`. Multi-locale via tabella
// `translations` arriverà in V2 (vedi pattern email-templates-tab del
// core).
import { updateAppSetting } from "@/lib/db/settings-queries";
import { requireAdminSectionPage } from "@/lib/rbac/guards";
import { getAdminUrlSlug } from "@/lib/admin-paths";
import { revalidatePath } from "next/cache";

export type TemplatesSaveResult =
  | { ok: true }
  | { ok: false; error: string };

type FieldKey =
  | "modules.notifications.email_achievement_first_like_subject"
  | "modules.notifications.email_achievement_first_like_body"
  | "modules.notifications.email_achievement_first_like_footer"
  | "modules.notifications.email_achievement_viral_likes_subject"
  | "modules.notifications.email_achievement_viral_likes_body"
  | "modules.notifications.email_achievement_viral_likes_footer"
  | "modules.notifications.email_achievement_viral_comments_subject"
  | "modules.notifications.email_achievement_viral_comments_body"
  | "modules.notifications.email_achievement_viral_comments_footer"
  | "modules.notifications.email_achievement_viral_reposts_subject"
  | "modules.notifications.email_achievement_viral_reposts_body"
  | "modules.notifications.email_achievement_viral_reposts_footer";

const FIELD_KEYS: readonly FieldKey[] = [
  "modules.notifications.email_achievement_first_like_subject",
  "modules.notifications.email_achievement_first_like_body",
  "modules.notifications.email_achievement_first_like_footer",
  "modules.notifications.email_achievement_viral_likes_subject",
  "modules.notifications.email_achievement_viral_likes_body",
  "modules.notifications.email_achievement_viral_likes_footer",
  "modules.notifications.email_achievement_viral_comments_subject",
  "modules.notifications.email_achievement_viral_comments_body",
  "modules.notifications.email_achievement_viral_comments_footer",
  "modules.notifications.email_achievement_viral_reposts_subject",
  "modules.notifications.email_achievement_viral_reposts_body",
  "modules.notifications.email_achievement_viral_reposts_footer",
];

export async function saveAchievementTemplates(
  _prev: unknown,
  formData: FormData,
): Promise<TemplatesSaveResult> {
  await requireAdminSectionPage("modules:notifications");

  try {
    await Promise.all(
      FIELD_KEYS.map((key) => {
        const raw = formData.get(key);
        const value = typeof raw === "string" ? raw.trim() : "";
        // Empty stringa → null per fallback ai defaults code-side.
        return updateAppSetting(key, value.length > 0 ? value : null);
      }),
    );
    const adminSlug = await getAdminUrlSlug();
    revalidatePath(`/${adminSlug}/modules/notifications/email`);
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Save failed";
    return { ok: false, error: message };
  }
}
