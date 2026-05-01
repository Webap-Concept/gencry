import { getAppSettings } from "@/lib/db/settings-queries";
import type { Metadata } from "next";
import { PricesSettingsForm } from "../_components/prices-settings-form";

export const metadata: Metadata = { title: "Prices / Settings" };

export const dynamic = "force-dynamic";

export default async function PricesSettingsPage() {
  const settings = await getAppSettings();
  return (
    <PricesSettingsForm
      initial={{
        prices_cron_minutes:     settings.prices_cron_minutes,
        prices_universe_hours:   settings.prices_universe_hours,
        prices_delta_threshold:  settings.prices_delta_threshold,
        prices_kv_ttl_seconds:   settings.prices_kv_ttl_seconds,
        prices_breaker_max_err:  settings.prices_breaker_max_err,
        prices_breaker_window_s: settings.prices_breaker_window_s,
        prices_breaker_open_s:   settings.prices_breaker_open_s,
        prices_snapshot_minutes: settings.prices_snapshot_minutes,
        prices_retention_days:   settings.prices_retention_days,
      }}
    />
  );
}
