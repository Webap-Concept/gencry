import type { Metadata } from "next";
import { getAppSettings } from "@/lib/db/settings-queries";
import { NotificationsSettingsForm } from "./_components/settings-form";

export const metadata: Metadata = { title: "Notifications / Settings" };
export const dynamic = "force-dynamic";

function clampInt(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

export default async function NotificationsAdminSettingsPage() {
  const settings = await getAppSettings();
  return (
    <NotificationsSettingsForm
      initial={{
        dedupWindowMinutes: clampInt(
          settings["modules.notifications.dedup_window_minutes"],
          60,
          1,
          1440,
        ),
        listPageSize: clampInt(
          settings["modules.notifications.list_page_size"],
          30,
          5,
          100,
        ),
        retentionDays: clampInt(
          settings["modules.notifications.retention_days"],
          180,
          7,
          3650,
        ),
        viralLikesEnabled:
          settings[
            "modules.notifications.achievements.viral_likes_enabled"
          ] !== "false",
        viralLikesThreshold: clampInt(
          settings[
            "modules.notifications.achievements.viral_likes_threshold"
          ],
          50,
          1,
          10000,
        ),
        viralLikesWindowHours: clampInt(
          settings[
            "modules.notifications.achievements.viral_likes_window_hours"
          ],
          24,
          1,
          720,
        ),
        viralCommentsEnabled:
          settings[
            "modules.notifications.achievements.viral_comments_enabled"
          ] !== "false",
        viralCommentsThreshold: clampInt(
          settings[
            "modules.notifications.achievements.viral_comments_threshold"
          ],
          10,
          1,
          10000,
        ),
        viralCommentsWindowHours: clampInt(
          settings[
            "modules.notifications.achievements.viral_comments_window_hours"
          ],
          24,
          1,
          720,
        ),
        viralRepostsEnabled:
          settings[
            "modules.notifications.achievements.viral_reposts_enabled"
          ] !== "false",
        viralRepostsThreshold: clampInt(
          settings[
            "modules.notifications.achievements.viral_reposts_threshold"
          ],
          5,
          1,
          10000,
        ),
        viralRepostsWindowHours: clampInt(
          settings[
            "modules.notifications.achievements.viral_reposts_window_hours"
          ],
          24,
          1,
          720,
        ),
        emailSendEnabled:
          settings["modules.notifications.email_send_enabled"] !== "false",
        emailGraceSeconds: clampInt(
          settings["modules.notifications.email_grace_seconds"],
          30,
          0,
          3600,
        ),
      }}
    />
  );
}
