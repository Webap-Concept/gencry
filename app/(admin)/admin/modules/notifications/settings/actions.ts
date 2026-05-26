"use server";
// app/(admin)/admin/modules/notifications/settings/actions.ts
//
// Save delle 3 settings del modulo notifications. RBAC enforced
// applicativamente + admin route guard (il layout chiama
// requireAdminSectionPage). Validazione clamp lato server.
import { revalidatePath } from "next/cache";
import { updateAppSetting } from "@/lib/db/settings-queries";
import { requireAdminSectionPage } from "@/lib/rbac/guards";
import { getAdminUrlSlug } from "@/lib/admin-paths";

export type SettingsSaveResult =
  | { ok: true }
  | { ok: false; error: string };

function clampInt(
  raw: FormDataEntryValue | null,
  fallback: number,
  min: number,
  max: number,
): number {
  if (raw == null) return fallback;
  const n = parseInt(String(raw), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

function checkboxToBool(raw: FormDataEntryValue | null): boolean {
  // HTML checkbox: presente in FormData se checked, assente se unchecked.
  return raw != null;
}

export async function saveNotificationsSettings(
  _prev: unknown,
  formData: FormData,
): Promise<SettingsSaveResult> {
  await requireAdminSectionPage("modules:notifications");

  const dedup = clampInt(formData.get("dedup_window_minutes"), 60, 1, 1440);
  const pageSize = clampInt(formData.get("list_page_size"), 30, 5, 100);
  const retention = clampInt(formData.get("retention_days"), 180, 7, 3650);

  // Achievement settings (V1 + V2 comments/reposts)
  const firstLikeEnabled = checkboxToBool(formData.get("first_like_enabled"));
  const viralLikesEnabled = checkboxToBool(formData.get("viral_likes_enabled"));
  const viralLikesThreshold = clampInt(
    formData.get("viral_likes_threshold"),
    50,
    1,
    10000,
  );
  const viralLikesWindowHours = clampInt(
    formData.get("viral_likes_window_hours"),
    24,
    1,
    720,
  );
  const viralCommentsEnabled = checkboxToBool(formData.get("viral_comments_enabled"));
  const viralCommentsThreshold = clampInt(
    formData.get("viral_comments_threshold"),
    10,
    1,
    10000,
  );
  const viralCommentsWindowHours = clampInt(
    formData.get("viral_comments_window_hours"),
    24,
    1,
    720,
  );
  const viralRepostsEnabled = checkboxToBool(formData.get("viral_reposts_enabled"));
  const viralRepostsThreshold = clampInt(
    formData.get("viral_reposts_threshold"),
    5,
    1,
    10000,
  );
  const viralRepostsWindowHours = clampInt(
    formData.get("viral_reposts_window_hours"),
    24,
    1,
    720,
  );

  await Promise.all([
    updateAppSetting(
      "modules.notifications.dedup_window_minutes",
      String(dedup),
    ),
    updateAppSetting("modules.notifications.list_page_size", String(pageSize)),
    updateAppSetting(
      "modules.notifications.retention_days",
      String(retention),
    ),
    updateAppSetting(
      "modules.notifications.achievements.first_like_enabled",
      firstLikeEnabled ? "true" : "false",
    ),
    updateAppSetting(
      "modules.notifications.achievements.viral_likes_enabled",
      viralLikesEnabled ? "true" : "false",
    ),
    updateAppSetting(
      "modules.notifications.achievements.viral_likes_threshold",
      String(viralLikesThreshold),
    ),
    updateAppSetting(
      "modules.notifications.achievements.viral_likes_window_hours",
      String(viralLikesWindowHours),
    ),
    updateAppSetting(
      "modules.notifications.achievements.viral_comments_enabled",
      viralCommentsEnabled ? "true" : "false",
    ),
    updateAppSetting(
      "modules.notifications.achievements.viral_comments_threshold",
      String(viralCommentsThreshold),
    ),
    updateAppSetting(
      "modules.notifications.achievements.viral_comments_window_hours",
      String(viralCommentsWindowHours),
    ),
    updateAppSetting(
      "modules.notifications.achievements.viral_reposts_enabled",
      viralRepostsEnabled ? "true" : "false",
    ),
    updateAppSetting(
      "modules.notifications.achievements.viral_reposts_threshold",
      String(viralRepostsThreshold),
    ),
    updateAppSetting(
      "modules.notifications.achievements.viral_reposts_window_hours",
      String(viralRepostsWindowHours),
    ),
  ]);

  const adminSlug = await getAdminUrlSlug();
  revalidatePath(`/${adminSlug}/modules/notifications/settings`);
  return { ok: true };
}
