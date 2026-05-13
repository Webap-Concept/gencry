import { db } from "@/lib/db/drizzle";
import { pricesCoins } from "@/lib/db/schema";
import { getAppSettings } from "@/lib/db/settings-queries";
import { PRICES_DEFAULTS } from "@/lib/modules/prices/config";
import { count, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { PricesSettingsForm } from "../_components/prices-settings-form";
import { StorageSimulator } from "../_components/storage-simulator";

export const metadata: Metadata = { title: "Prices / Settings" };

export const dynamic = "force-dynamic";

export default async function PricesSettingsPage() {
  const settings = await getAppSettings();

  // Numero coin attivi: serve come baseline iniziale per il simulator.
  const [activeRow] = await db
    .select({ n: count() })
    .from(pricesCoins)
    .where(eq(pricesCoins.isActive, true));
  const activeCoinsCount = activeRow?.n ?? 0;

  // Snapshot/retention correnti dal DB, con fallback ai defaults se non
  // ancora settati. Il parser nel form fa il proprio clamp, qui basta
  // un Number() onesto.
  const snapshotMinutes =
    Number(settings["modules.prices.snapshot_minutes"]) ||
    PRICES_DEFAULTS.snapshotMinutes;
  const retentionDays =
    Number(settings["modules.prices.retention_days"]) ||
    PRICES_DEFAULTS.retentionDays;

  // Sicurezza: il secret R2 NON viaggia mai al client. Passiamo solo un boolean
  // che indica se è valorizzato; la UI mostra "********" come placeholder.
  const r2SecretIsSet = Boolean(settings["modules.prices.r2.secret_access_key"]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <PricesSettingsForm
        initial={{
          "modules.prices.cron_minutes":           settings["modules.prices.cron_minutes"],
          "modules.prices.universe_hours":         settings["modules.prices.universe_hours"],
          "modules.prices.delta_threshold":        settings["modules.prices.delta_threshold"],
          "modules.prices.breaker_max_err":        settings["modules.prices.breaker_max_err"],
          "modules.prices.breaker_window_s":       settings["modules.prices.breaker_window_s"],
          "modules.prices.breaker_open_s":         settings["modules.prices.breaker_open_s"],
          "modules.prices.snapshot_minutes":       settings["modules.prices.snapshot_minutes"],
          "modules.prices.retention_days":         settings["modules.prices.retention_days"],
          "modules.prices.coingecko_pro_enabled":  settings["modules.prices.coingecko_pro_enabled"],
          "modules.prices.coingecko_pro_api_key":  settings["modules.prices.coingecko_pro_api_key"],
          "modules.prices.r2.account_id":          settings["modules.prices.r2.account_id"],
          "modules.prices.r2.access_key_id":       settings["modules.prices.r2.access_key_id"],
          "modules.prices.r2.bucket":              settings["modules.prices.r2.bucket"],
          "modules.prices.r2.public_base_url":     settings["modules.prices.r2.public_base_url"],
          r2SecretIsSet,
        }}
      />

      <StorageSimulator
        initialCoinsCount={activeCoinsCount}
        initialSnapshotMinutes={snapshotMinutes}
        initialRetentionDays={retentionDays}
      />
    </div>
  );
}
