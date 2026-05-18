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
      }}
    />
  );
}
