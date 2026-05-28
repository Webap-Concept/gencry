// components/modules/watchlist/watchlist-card.tsx
//
// Card lista watchlist (mio profilo). Riusabile cross-context: lista
// /watchlist, future slot home, eventuali widget. Server Component:
// nessun stato locale, riceve `WatchlistSummary` server-side.
//
// Slot `actions` opzionale per il dropdown menu (client). Lo passiamo
// dal parent client invece di importarlo qui per tenere il card
// rendering server-side (zero JS shipped per la card statica).
import Link from "next/link";
import { Globe, Lock } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { WatchlistSummary } from "@/lib/modules/watchlist/types";
import { CoinIcon } from "@/components/modules/coins/coin-icon";
import { cn } from "@/lib/utils";

type Props = {
  watchlist: WatchlistSummary;
  /** Slot client per dropdown menu actions. Quando absent, la card
   *  e' read-only (vista pubblica /w/<u>/<slug>). */
  actions?: React.ReactNode;
  /** Locale-aware "aggiornata X" — calcolato dal parent server per
   *  evitare di passare Date al client. */
  updatedAtLabel?: string;
};

export async function WatchlistCard({ watchlist, actions, updatedAtLabel }: Props) {
  const t = await getTranslations("watchlist.card");
  const href = `/watchlist/${watchlist.id}`;

  return (
    <article className="bg-gc-bg-2 border border-gc-line rounded-2xl p-4 flex flex-col gap-4">
      {/* Header: title + visibility badge + actions slot */}
      <header className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <Link
            href={href}
            prefetch={false}
            className="block group/title"
          >
            <h3 className="text-base font-semibold text-gc-fg truncate leading-tight group-hover/title:underline decoration-gc-line underline-offset-4">
              {watchlist.name}
            </h3>
          </Link>
          <div className="flex items-center gap-1.5 mt-1">
            <VisibilityBadge visibility={watchlist.visibility} t={t} />
            {watchlist.description ? (
              <span className="text-xs text-gc-fg-3 truncate">
                · {watchlist.description}
              </span>
            ) : null}
          </div>
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </header>

      {/* Perf 30g + coins preview */}
      <div className="flex items-end justify-between gap-3">
        <Perf30dLabel value={watchlist.perf30dPct} label={t("perf_30d_label")} fallback={t("perf_unavailable")} />
        <CoinsPreview coins={watchlist.topCoins} emptyLabel={t("no_coins")} />
      </div>

      {/* Footer compatto: N coin · aggiornata X */}
      <footer className="flex items-center justify-between text-[11px] text-gc-fg-3 border-t border-gc-line pt-3">
        <span>{t("coins_count", { count: watchlist.coinsCount })}</span>
        {updatedAtLabel ? <span>{updatedAtLabel}</span> : null}
      </footer>
    </article>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────

function VisibilityBadge({
  visibility,
  t,
}: {
  visibility: "private" | "public";
  t: Awaited<ReturnType<typeof getTranslations<"watchlist.card">>>;
}) {
  const Icon = visibility === "public" ? Globe : Lock;
  const label = visibility === "public" ? t("visibility_public") : t("visibility_private");
  return (
    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-gc-fg-3">
      <Icon size={11} strokeWidth={2} aria-hidden />
      {label}
    </span>
  );
}

function Perf30dLabel({
  value,
  label,
  fallback,
}: {
  value: number | null;
  label: string;
  fallback: string;
}) {
  if (value === null || !Number.isFinite(value)) {
    return (
      <div className="min-w-0">
        <p className="text-2xl font-serif text-gc-fg-3 tabular-nums leading-none">{fallback}</p>
        <p className="text-[10px] uppercase tracking-wide text-gc-fg-3 mt-1">{label}</p>
      </div>
    );
  }
  const tone =
    value > 0 ? "text-gc-pos" : value < 0 ? "text-gc-neg" : "text-gc-fg-3";
  const sign = value > 0 ? "+" : "";
  return (
    <div className="min-w-0">
      <p
        className={cn(
          "text-2xl font-serif tabular-nums leading-none",
          tone,
        )}
      >
        {sign}
        {value.toFixed(1)}%
      </p>
      <p className="text-[10px] uppercase tracking-wide text-gc-fg-3 mt-1">{label}</p>
    </div>
  );
}

function CoinsPreview({
  coins,
  emptyLabel,
}: {
  coins: { symbol: string; name: string; imageUrl: string | null }[];
  emptyLabel: string;
}) {
  if (coins.length === 0) {
    return <span className="text-xs text-gc-fg-3">{emptyLabel}</span>;
  }
  return (
    <ul className="flex -space-x-2" aria-label="Coins">
      {coins.map((c) => (
        <li key={c.symbol} className="ring-2 ring-gc-bg-2 rounded-full">
          <CoinIcon
            symbol={c.symbol}
            name={c.name}
            imageUrl={c.imageUrl}
            size="sm"
          />
        </li>
      ))}
    </ul>
  );
}
