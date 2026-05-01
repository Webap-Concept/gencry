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
        "modules.prices.cron_minutes":     settings["modules.prices.cron_minutes"],
        "modules.prices.universe_hours":   settings["modules.prices.universe_hours"],
        "modules.prices.delta_threshold":  settings["modules.prices.delta_threshold"],
        "modules.prices.kv_ttl_seconds":   settings["modules.prices.kv_ttl_seconds"],
        "modules.prices.breaker_max_err":  settings["modules.prices.breaker_max_err"],
        "modules.prices.breaker_window_s": settings["modules.prices.breaker_window_s"],
        "modules.prices.breaker_open_s":   settings["modules.prices.breaker_open_s"],
        "modules.prices.snapshot_minutes": settings["modules.prices.snapshot_minutes"],
        "modules.prices.retention_days":   settings["modules.prices.retention_days"],
      }}
    />
  );
}
