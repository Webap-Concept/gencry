import { listCoins, getCurrentPrices } from "@/lib/modules/prices/queries";
import type { Metadata } from "next";
import { CoinsRegistry } from "../_components/coins-registry";

export const metadata: Metadata = { title: "Prices / Coins Registry" };

export const dynamic = "force-dynamic";

export default async function PricesCoinsPage() {
  const coins = await listCoins();
  const priceMap = await getCurrentPrices(coins.map((c) => c.symbol));
  return <CoinsRegistry coins={coins} priceMap={Object.fromEntries(priceMap)} />;
}
