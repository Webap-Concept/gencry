"use server";
// app/(admin)/admin/modules/watchlist/settings/actions.ts
//
// Save delle 4 settings del modulo watchlist (cap free/premium, cap
// coin per watchlist, TTL cache perf). RBAC enforced applicativamente +
// admin route guard (il layout chiama requireAdminSectionPage).
// Validazione clamp lato server. Pattern allineato a notifications.
import { revalidatePath } from "next/cache";
import { updateAppSetting } from "@/lib/db/settings-queries";
import { requireAdminSectionPage } from "@/lib/rbac/guards";
import { getAdminUrlSlug } from "@/lib/admin-paths";

export type SettingsSaveResult = { ok: true } | { ok: false; error: string };

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

export async function saveWatchlistSettings(
  _prev: unknown,
  formData: FormData,
): Promise<SettingsSaveResult> {
  await requireAdminSectionPage("modules:watchlist");

  const maxFree = clampInt(formData.get("max_per_user_free"), 5, 1, 100);
  const maxPremium = clampInt(
    formData.get("max_per_user_premium"),
    20,
    1,
    500,
  );
  const maxCoins = clampInt(
    formData.get("max_coins_per_watchlist"),
    50,
    1,
    1000,
  );
  const perfTtl = clampInt(
    formData.get("perf_cache_ttl_seconds"),
    300,
    30,
    3600,
  );

  await Promise.all([
    updateAppSetting("modules.watchlist.max_per_user_free", String(maxFree)),
    updateAppSetting(
      "modules.watchlist.max_per_user_premium",
      String(maxPremium),
    ),
    updateAppSetting(
      "modules.watchlist.max_coins_per_watchlist",
      String(maxCoins),
    ),
    updateAppSetting(
      "modules.watchlist.perf_cache_ttl_seconds",
      String(perfTtl),
    ),
  ]);

  const adminSlug = await getAdminUrlSlug();
  revalidatePath(`/${adminSlug}/modules/watchlist/settings`);
  return { ok: true };
}
