import { getAdminPath } from "@/lib/admin-paths";
import {
  getCoinExchangeCounts,
  getCurrentPrices,
  listCoinsPaged,
  type CoinRegistryFilter,
} from "@/lib/modules/prices/queries";
import type { Metadata } from "next";
import { CoinsRegistry } from "../_components/coins-registry";

export const metadata: Metadata = { title: "Prices / Coins Registry" };

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

function firstStr(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  const t = s?.trim();
  return t ? t : undefined;
}

export default async function PricesCoinsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;

  const page = Math.max(1, Number(firstStr(sp.page)) || 1);
  const q = firstStr(sp.q);
  const exchangeRaw = firstStr(sp.exchange); // binance|kucoin|gate|none|all
  const enrichmentRaw = firstStr(sp.enrichment);
  const enrichment =
    enrichmentRaw === "enriched" || enrichmentRaw === "placeholder"
      ? enrichmentRaw
      : undefined;
  const minMarketCap = Number(firstStr(sp.mcap)) || 0;

  const filter: CoinRegistryFilter = {
    q,
    exchange: !exchangeRaw || exchangeRaw === "all" ? undefined : exchangeRaw,
    enrichment,
    minMarketCap,
  };

  const [{ rows: coins, total }, exchangeCounts, adminCoinsPath] =
    await Promise.all([
      listCoinsPaged(filter, page, PAGE_SIZE),
      getCoinExchangeCounts(),
      getAdminPath("prices-coins"),
    ]);

  // Prezzi solo per la pagina corrente (hot Redis, 1 lettura).
  const priceMap = await getCurrentPrices(coins.map((c) => c.symbol));

  return (
    <CoinsRegistry
      coins={coins}
      total={total}
      page={page}
      pageSize={PAGE_SIZE}
      priceMap={Object.fromEntries(priceMap)}
      adminCoinsPath={adminCoinsPath}
      exchangeCounts={exchangeCounts}
      filters={{
        q: q ?? "",
        exchange: exchangeRaw ?? "all",
        enrichment: enrichment ?? "all",
        mcap: minMarketCap,
      }}
    />
  );
}
