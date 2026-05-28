// components/modules/watchlist/watchlist-overview-card.tsx
//
// Card overview "isola dark" sopra il grid delle mie watchlist. Pattern
// allineato a `CoinSummaryCard` del feed explore: scope `.gc-dark` per
// tema bosco anche se l'utente e' in sabbia.
//
// Server Component. Riceve `WatchlistOverviewStats` gia' calcolato.

import { getLocale, getTranslations } from "next-intl/server";
import { Activity, Coins, ListChecks, TrendingUp } from "lucide-react";
import type { WatchlistOverviewStats } from "@/lib/modules/watchlist/queries";
import { CoinIcon } from "@/components/modules/coins/coin-icon";

type Props = {
  stats: WatchlistOverviewStats;
};

export async function WatchlistOverviewCard({ stats }: Props) {
  const t = await getTranslations("watchlist.overview");
  const locale = await getLocale();

  return (
    <section className="gc-dark rounded-2xl bg-gc-bg-2 border border-gc-line p-5 sm:p-6">
      <div className="grid gap-5 sm:grid-cols-[1.4fr_1fr]">
        {/* Sinistra: perf 30g grande + subtitle */}
        <Perf30dBlock
          value={stats.weightedPerf30dPct}
          watchlistsCount={stats.watchlistsCount}
          uniqueCoinsCount={stats.uniqueCoinsCount}
          lastSyncAt={stats.lastSyncAt}
          tLabel={t("perf_label")}
          tSubtitleFallback={t("perf_subtitle_fallback")}
          tSubtitle={(values) => t("perf_subtitle", values)}
          tSyncNow={t("sync_now")}
          locale={locale}
        />

        {/* Destra: 2x2 mini-stat */}
        <div className="grid grid-cols-2 gap-3 border-t border-gc-line pt-4 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-5">
          <MiniStat
            icon={ListChecks}
            label={t("watchlists_count_label")}
            value={String(stats.watchlistsCount)}
            hint={t("watchlists_count_hint")}
          />
          <MiniStat
            icon={Coins}
            label={t("unique_coins_label")}
            value={String(stats.uniqueCoinsCount)}
            hint={
              stats.addedLast30dCount > 0
                ? t("unique_coins_added_30d", { count: stats.addedLast30dCount })
                : t("unique_coins_hint_none")
            }
          />
          <TopMoverStat
            topMover={stats.topMover24h}
            label={t("top_mover_label")}
            emptyLabel={t("top_mover_empty")}
          />
          <MiniStat
            icon={Activity}
            label={t("last_sync_label")}
            value={formatLastSync(stats.lastSyncAt, locale, t("sync_now"))}
            hint={t("last_sync_hint")}
          />
        </div>
      </div>
    </section>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────

function Perf30dBlock({
  value,
  watchlistsCount,
  uniqueCoinsCount,
  lastSyncAt,
  tLabel,
  tSubtitleFallback,
  tSubtitle,
  tSyncNow,
  locale,
}: {
  value: number | null;
  watchlistsCount: number;
  uniqueCoinsCount: number;
  lastSyncAt: Date | null;
  tLabel: string;
  tSubtitleFallback: string;
  tSubtitle: (values: {
    watchlists: number;
    coins: number;
    sync: string;
  }) => string;
  tSyncNow: string;
  locale: string;
}) {
  const isAvail = value !== null && Number.isFinite(value);
  const tone =
    isAvail && (value as number) > 0
      ? "text-gc-pos"
      : isAvail && (value as number) < 0
        ? "text-gc-neg"
        : "text-gc-fg-3";
  const sign = isAvail && (value as number) > 0 ? "+" : "";
  const display = isAvail ? `${sign}${(value as number).toFixed(1)}%` : "—";

  const syncStr = lastSyncAt
    ? formatLastSync(lastSyncAt, locale, tSyncNow)
    : "—";
  const subtitle =
    watchlistsCount > 0
      ? tSubtitle({
          watchlists: watchlistsCount,
          coins: uniqueCoinsCount,
          sync: syncStr,
        })
      : tSubtitleFallback;

  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-[0.18em] text-gc-fg-3 mb-2">
        — {tLabel}
      </p>
      <p
        className={`font-serif tabular-nums leading-none text-5xl sm:text-6xl ${tone}`}
      >
        {display}
      </p>
      <p className="text-xs text-gc-fg-3 mt-3 leading-relaxed">{subtitle}</p>
    </div>
  );
}

function MiniStat({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-gc-fg-3">
        <Icon size={11} strokeWidth={2} aria-hidden />
        <span className="truncate">{label}</span>
      </div>
      <p className="text-2xl font-serif text-gc-fg tabular-nums leading-none mt-1.5">
        {value}
      </p>
      {hint ? (
        <p className="text-[10px] text-gc-fg-3 mt-1 truncate">{hint}</p>
      ) : null}
    </div>
  );
}

function TopMoverStat({
  topMover,
  label,
  emptyLabel,
}: {
  topMover: WatchlistOverviewStats["topMover24h"];
  label: string;
  emptyLabel: string;
}) {
  if (!topMover) {
    return (
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-gc-fg-3">
          <TrendingUp size={11} strokeWidth={2} aria-hidden />
          <span className="truncate">{label}</span>
        </div>
        <p className="text-2xl font-serif text-gc-fg-3 tabular-nums leading-none mt-1.5">
          —
        </p>
        <p className="text-[10px] text-gc-fg-3 mt-1 truncate">{emptyLabel}</p>
      </div>
    );
  }
  const tone =
    topMover.change24hPct > 0
      ? "text-gc-pos"
      : topMover.change24hPct < 0
        ? "text-gc-neg"
        : "text-gc-fg-3";
  const sign = topMover.change24hPct > 0 ? "+" : "";
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-gc-fg-3">
        <TrendingUp size={11} strokeWidth={2} aria-hidden />
        <span className="truncate">{label}</span>
      </div>
      <div className="flex items-center gap-1.5 mt-1.5">
        <CoinIcon
          symbol={topMover.symbol}
          name={topMover.name}
          imageUrl={topMover.imageUrl}
          size="sm"
        />
        <p className={`text-base font-serif tabular-nums ${tone}`}>
          ${topMover.symbol}{" "}
          <span className="font-semibold">
            {sign}
            {topMover.change24hPct.toFixed(1)}%
          </span>
        </p>
      </div>
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────

function formatLastSync(
  date: Date | null,
  locale: string,
  nowLabel: string,
): string {
  if (!date) return "—";
  const diffMs = Date.now() - new Date(date).getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return nowLabel;
  if (sec < 3600) {
    const n = Math.floor(sec / 60);
    return locale.startsWith("it") ? `${n} min fa` : `${n} min ago`;
  }
  if (sec < 86_400) {
    const n = Math.floor(sec / 3600);
    return locale.startsWith("it") ? `${n}h fa` : `${n}h ago`;
  }
  return new Date(date).toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
  });
}
