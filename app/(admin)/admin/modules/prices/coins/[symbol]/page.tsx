// app/(admin)/admin/modules/prices/coins/[symbol]/page.tsx
// Drill-down admin per un singolo coin. Mostra metadata, stats su
// prices_history (count, gap, righe arrotondate), e tabella prezzi
// paginata. Linkata dalla riga del registry (cliccando il simbolo).

import { getAdminPath } from "@/lib/admin-paths";
import {
  getCoinForCard,
  getCoinHistoryPage,
  getCoinHistoryStats,
} from "@/lib/modules/prices/queries";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CoinDetailHeader } from "./_components/coin-detail-header";
import { CoinHistoryPanel } from "./_components/coin-history-panel";
import { CoinStatsCards } from "./_components/coin-stats-cards";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ symbol: string }>;
}): Promise<Metadata> {
  const { symbol } = await params;
  return { title: `Prices / Coins / ${symbol.toUpperCase()}` };
}

export default async function CoinDrilldownPage({
  params,
  searchParams,
}: {
  params: Promise<{ symbol: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { symbol } = await params;
  const { page: pageRaw } = await searchParams;
  const upper = symbol.toUpperCase();

  const page = Math.max(1, Number(pageRaw) || 1);

  const [coin, stats, historyPage, coinsBack] = await Promise.all([
    getCoinForCard(upper),
    getCoinHistoryStats(upper),
    getCoinHistoryPage(upper, page, PAGE_SIZE),
    getAdminPath("prices-coins"),
  ]);

  if (!coin) notFound();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Link
        href={coinsBack}
        className="inline-flex items-center gap-1.5 text-xs font-medium"
        style={{ color: "var(--admin-text-muted)" }}>
        <ArrowLeft size={13} />
        Back to coins registry
      </Link>

      <CoinDetailHeader coin={coin} />

      <CoinStatsCards coin={coin} stats={stats} />

      <CoinHistoryPanel
        symbol={upper}
        historyPage={historyPage}
        roundedRows={stats.rounded}
        adminCoinsPath={coinsBack}
      />
    </div>
  );
}
