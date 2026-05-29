import type { Metadata } from "next";
import { getAppSettings } from "@/lib/db/settings-queries";
import { WatchlistSettingsForm } from "./_components/settings-form";

export const metadata: Metadata = { title: "Watchlist / Impostazioni" };
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

export default async function WatchlistAdminSettingsPage() {
  const settings = await getAppSettings();
  return (
    <WatchlistSettingsForm
      initial={{
        maxPerUserFree: clampInt(
          settings["modules.watchlist.max_per_user_free"],
          5,
          1,
          100,
        ),
        maxPerUserPremium: clampInt(
          settings["modules.watchlist.max_per_user_premium"],
          20,
          1,
          500,
        ),
        maxCoinsPerWatchlist: clampInt(
          settings["modules.watchlist.max_coins_per_watchlist"],
          50,
          1,
          1000,
        ),
        perfCacheTtlSeconds: clampInt(
          settings["modules.watchlist.perf_cache_ttl_seconds"],
          300,
          30,
          3600,
        ),
      }}
    />
  );
}
