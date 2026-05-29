// app/(protected)/watchlist/[id]/page.tsx
//
// Detail della watchlist propria. RSC con ownership check inline
// (getMyWatchlistById ritorna null se non e' del viewer). 404 indistinguibile.
import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowLeft, Globe, Lock } from "lucide-react";
import type { Metadata } from "next";
import { getUser } from "@/lib/db/queries";
import { getMyWatchlistById } from "@/lib/modules/watchlist/queries";
import { CoinIcon } from "@/components/modules/coins/coin-icon";
import { CoinPriceLabel } from "@/components/modules/coins/coin-price-label";
import { WatchlistCardActions } from "../_components/watchlist-card-actions";
import { AddCoinButton } from "./_components/add-coin-button";
import { CoinRowRemove } from "./_components/coin-row-remove";
import { WatchlistDetailSkeleton } from "./_components/watchlist-detail-skeleton";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const user = await getUser();
  if (!user) return { title: "Watchlist" };
  const wl = await getMyWatchlistById(user.id, id);
  if (!wl) return { title: "Watchlist" };
  return { title: wl.name };
}

export default async function WatchlistDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ add?: string }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const user = await getUser();
  if (!user) redirect("/sign-in");
  const autoOpenAddCoin = sp.add === "1";

  return (
    <div className="max-w-3xl mx-auto py-6 space-y-6">
      <Suspense fallback={<WatchlistDetailSkeleton />}>
        <DetailBody
          watchlistId={id}
          userId={user.id}
          autoOpenAddCoin={autoOpenAddCoin}
        />
      </Suspense>
    </div>
  );
}

async function DetailBody({
  watchlistId,
  userId,
  autoOpenAddCoin,
}: {
  watchlistId: string;
  userId: string;
  autoOpenAddCoin: boolean;
}) {
  const [wl, t, tForm, locale, viewer] = await Promise.all([
    getMyWatchlistById(userId, watchlistId),
    getTranslations("watchlist.detail"),
    getTranslations("watchlist.card"),
    getLocale(),
    getUser(),
  ]);
  if (!wl) notFound();
  const ownerUsername = viewer?.username ?? null;

  return (
    <>
      <Link
        href="/watchlist"
        prefetch={false}
        className="inline-flex items-center gap-1.5 text-xs text-gc-fg-3 hover:text-gc-fg-2 transition-colors"
      >
        <ArrowLeft size={14} aria-hidden />
        {t("back_to_list")}
      </Link>

      {/* Header detail */}
      <header className="bg-gc-bg-2 border border-gc-line rounded-2xl p-5">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-serif text-gc-fg leading-tight truncate">
                {wl.name}
              </h1>
              <VisibilityChip visibility={wl.visibility} tCard={tForm} />
            </div>
            {wl.description ? (
              <p className="text-sm text-gc-fg-2 mt-1.5 whitespace-pre-wrap">
                {wl.description}
              </p>
            ) : null}
          </div>
          <div className="shrink-0">
            <WatchlistCardActions
              id={wl.id}
              slug={wl.slug}
              name={wl.name}
              description={wl.description}
              visibility={wl.visibility}
              coinsCount={wl.coinsCount}
              ownerUsername={ownerUsername}
            />
          </div>
        </div>

        {/* Stats: perf 30g + N coin */}
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-gc-line pt-4">
          <Perf30dStat value={wl.perf30dPct} label={t("perf_30d_label")} />
          <CoinsStat
            count={wl.coinsCount}
            label={tForm("coins_count", { count: wl.coinsCount })}
          />
        </div>
      </header>

      {/* Lista coin */}
      <section className="bg-gc-bg-2 border border-gc-line rounded-2xl overflow-hidden">
        <header className="flex items-center justify-between px-4 py-3 border-b border-gc-line">
          <h2 className="text-sm font-semibold text-gc-fg">
            {t("coins_table_header_coin")}
          </h2>
          <AddCoinButton
            watchlistId={wl.id}
            label={t("add_coin_button")}
            autoOpen={autoOpenAddCoin}
          />
        </header>
        {wl.coins.length === 0 ? (
          <CoinsEmpty t={t} />
        ) : (
          <ul aria-label={t("coins_table_header_coin")}>
            {wl.coins.map((c) => (
              <li
                key={c.symbol}
                className="flex items-center gap-3 px-4 py-3 border-b border-gc-line last:border-0"
              >
                <Link
                  href={`/coins/${c.symbol.toLowerCase()}`}
                  prefetch={false}
                  className="flex items-center gap-3 flex-1 min-w-0 group/coin"
                >
                  <CoinIcon
                    symbol={c.symbol}
                    name={c.name}
                    imageUrl={c.imageUrl}
                    size="md"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gc-fg truncate group-hover/coin:underline decoration-gc-line underline-offset-4">
                      {c.name}
                    </p>
                    <p className="text-[11px] uppercase tracking-wide text-gc-fg-3">
                      {c.symbol}
                    </p>
                  </div>
                </Link>
                <CoinPriceLabel
                  price={c.price}
                  change24h={c.change24h}
                  size="sm"
                  className="text-right shrink-0"
                />
                <CoinRowRemove
                  watchlistId={wl.id}
                  symbol={c.symbol}
                  ariaLabel={t("coin_remove_aria", { symbol: c.symbol })}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────

function VisibilityChip({
  visibility,
  tCard,
}: {
  visibility: "private" | "public";
  tCard: Awaited<ReturnType<typeof getTranslations<"watchlist.card">>>;
}) {
  const Icon = visibility === "public" ? Globe : Lock;
  const label =
    visibility === "public"
      ? tCard("visibility_public")
      : tCard("visibility_private");
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] uppercase tracking-wide rounded-full bg-gc-bg-3 text-gc-fg-2 shrink-0">
      <Icon size={11} strokeWidth={2} aria-hidden />
      {label}
    </span>
  );
}

function Perf30dStat({
  value,
  label,
}: {
  value: number | null;
  label: string;
}) {
  if (value === null) {
    return (
      <div>
        <p className="text-2xl font-serif text-gc-fg-3 tabular-nums leading-none">—</p>
        <p className="text-[10px] uppercase tracking-wide text-gc-fg-3 mt-1.5">
          {label}
        </p>
      </div>
    );
  }
  const tone =
    value > 0 ? "text-gc-pos" : value < 0 ? "text-gc-neg" : "text-gc-fg-3";
  const sign = value > 0 ? "+" : "";
  return (
    <div>
      <p className={`text-2xl font-serif tabular-nums leading-none ${tone}`}>
        {sign}
        {value.toFixed(1)}%
      </p>
      <p className="text-[10px] uppercase tracking-wide text-gc-fg-3 mt-1.5">
        {label}
      </p>
    </div>
  );
}

function CoinsStat({ count, label }: { count: number; label: string }) {
  return (
    <div>
      <p className="text-2xl font-serif text-gc-fg tabular-nums leading-none">
        {count}
      </p>
      <p className="text-[10px] uppercase tracking-wide text-gc-fg-3 mt-1.5">
        {label}
      </p>
    </div>
  );
}

function CoinsEmpty({
  t,
}: {
  t: Awaited<ReturnType<typeof getTranslations<"watchlist.detail">>>;
}) {
  return (
    <div className="p-8 text-center flex flex-col items-center gap-2">
      <h3 className="text-base font-serif text-gc-fg">{t("coin_empty_title")}</h3>
      <p className="text-sm text-gc-fg-3 max-w-md">
        {t("coin_empty_description")}
      </p>
    </div>
  );
}
