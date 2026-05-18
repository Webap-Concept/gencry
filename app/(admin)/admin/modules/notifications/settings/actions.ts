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

export async function saveNotificationsSettings(
  _prev: unknown,
  formData: FormData,
): Promise<SettingsSaveResult> {
  await requireAdminSectionPage("modules:notifications");

  const dedup = clampInt(formData.get("dedup_window_minutes"), 60, 1, 1440);
  const pageSize = clampInt(formData.get("list_page_size"), 30, 5, 100);
  const retention = clampInt(formData.get("retention_days"), 180, 7, 3650);

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
  ]);

  const adminSlug = await getAdminUrlSlug();
  revalidatePath(`/${adminSlug}/modules/notifications/settings`);
  return { ok: true };
}
