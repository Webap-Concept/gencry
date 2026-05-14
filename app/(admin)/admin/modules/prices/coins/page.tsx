import { getAdminPath } from "@/lib/admin-paths";
import { listCoins, getCurrentPrices } from "@/lib/modules/prices/queries";
import type { Metadata } from "next";
import { CoinsRegistry } from "../_components/coins-registry";

export const metadata: Metadata = { title: "Prices / Coins Registry" };

export const dynamic = "force-dynamic";

export default async function PricesCoinsPage() {
  const [coins, adminCoinsPath] = await Promise.all([
    listCoins(),
    getAdminPath("prices-coins"),
  ]);
  const priceMap = await getCurrentPrices(coins.map((c) => c.symbol));
  return (
    <CoinsRegistry
      coins={coins}
      priceMap={Object.fromEntries(priceMap)}
      adminCoinsPath={adminCoinsPath}
    />
  );
}
