// app/(protected)/explore/page.tsx
//
// Pagina "Esplora" (Discover feed pubblico). Pattern allineato a
// GetStream §8: trending è una query separata (TrendingTickersRow),
// non un ranking del feed cronologico. La pagina è composta da 3
// blocchi indipendenti:
//
//   1. <TrendingTickersRow>     — top 10 ticker ultime 24h, cache 5min
//   2. <NewPostsBannerSlot>     — placeholder v1, wirato in Tier 2 con
//                                 Supabase Realtime ("X nuovi post")
//   3. <FeedList>               — feed Discover, oppure filtro per ticker
//
// Loggati: vedono `public + members`. Anonimi non passano qui (la
// rotta è in `(protected)`); l'apertura ai non-loggati arriverà col
// PR-9 SEO + adaptive `(public)` layout.
import { CoinSummaryCard } from "@/components/modules/coins/coin-summary-card";
import { FeedList } from "@/components/modules/posts/FeedList";
import { NewPostsBannerSlot } from "@/components/modules/posts/NewPostsBannerSlot";
import { TrendingCoinsRow } from "@/components/modules/posts/TrendingCoinsRow";
import { getUser } from "@/lib/db/queries";
import { loadCommentsConfig } from "@/lib/modules/posts/comments-config";
import { collectVisibleTickers } from "@/lib/modules/posts/lib/collect-visible-tickers";
import {
  getDiscoverFeedIds,
  getPostsByIds,
  getTickerFeedIds,
} from "@/lib/modules/posts/queries";
import { getTickerPreviewBatch } from "@/lib/modules/posts/ticker-preview-actions";
import { getCoinForCard, getCoinNameMap } from "@/lib/modules/prices/queries";
import { getFollowingSet } from "@/lib/modules/social-graph/queries";
import { Search } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import "server-only";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("posts.explore");
  return { title: t("page_title") };
}
export const dynamic = "force-dynamic";

type SearchParams = { ticker?: string };

const TICKER_REGEX = /^[A-Z][A-Z0-9]{1,19}$/;

function parseTicker(raw: string | undefined): string | null {
  if (!raw) return null;
  const upper = raw.trim().toUpperCase();
  return TICKER_REGEX.test(upper) ? upper : null;
}

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const ticker = parseTicker(params.ticker);

  const user = await getUser();
  if (!user) {
    // Anonimi non dovrebbero atterrare qui (rotta protected), ma defensive.
    throw new Error("Explore rendered without authenticated user");
  }

  // Carica la prima pagina del feed scelto + (se ticker) lo snapshot
  // del coin per il CoinSummaryCard sticky + la coinNameMap per il
  // match nomi estesi nel PostBody di ogni card.
  const [page, coin, coinNameMap, commentsConfig] = await Promise.all([
    ticker
      ? getTickerFeedIds({ ticker, viewerUserId: user.id })
      : getDiscoverFeedIds({ viewerUserId: user.id }),
    ticker ? getCoinForCard(ticker) : Promise.resolve(null),
    getCoinNameMap(),
    loadCommentsConfig(),
  ]);
  const initialPosts = await getPostsByIds(page.ids, { viewerUserId: user.id });
  // Prefetch batch dei preview ticker visibili (incluso il filter ticker
  // attivo, così l'hover su CoinSummaryCard è già hot).
  const visibleSymbols = collectVisibleTickers(initialPosts);
  if (ticker) visibleSymbols.push(ticker);
  const [tickerPreviewMap, followingSet] = await Promise.all([
    getTickerPreviewBatch(visibleSymbols),
    getFollowingSet(user.id),
  ]);
  const viewerFollowingMap: Record<string, boolean> = {};
  for (const p of initialPosts) {
    viewerFollowingMap[p.author.id] = followingSet.has(p.author.id);
  }

  const source = ticker
    ? ({ kind: "ticker", ticker } as const)
    : ({ kind: "discover" } as const);

  const tExp = await getTranslations("posts.explore");

  return (
    // Outer = pb only. Niente padding-top: quando c'è ticker, la
    // CoinSummaryCard si attacca al top del main (annulla anche il py-6
    // del ProtectedShell tramite `-mt-6`). Quando non c'è ticker, il
    // TrendingCoinCards apre direttamente la pagina senza header
    // (decisione UX 2026-05-18: meno chrome, più contenuto sopra).
    <div className="pb-6 space-y-4">
      {/* Block 1 — Header dinamico:
          - Senza filtro → TrendingCoinsRow (grid di 4 coin cards)
          - Con ticker tracciato → CoinSummaryCard (banner "Discussioni
            su" + snapshot + sticky)
          - Con ticker non tracciato → fallback testuale */}
      {ticker ? (
        coin ? (
          <CoinSummaryCard coin={coin} />
        ) : (
          <div className="max-w-2xl mx-auto pt-6">
            <div className="rounded-2xl border border-dashed border-gc-line bg-gc-bg-2 p-4 text-sm text-gc-fg-2">
              <strong>${ticker}</strong> {tExp("untracked_fallback")}
            </div>
          </div>
        )
      ) : (
        <div className="max-w-2xl mx-auto pt-6">
          <Suspense fallback={null}>
            <TrendingCoinsRow />
          </Suspense>
        </div>
      )}

      {/* Block 2 + 3 — Realtime banner slot e feed: max-w-2xl per
          readability del testo nei post. */}
      <div className="max-w-2xl mx-auto space-y-4">
        <NewPostsBannerSlot
          feedKind={ticker ? "ticker" : "discover"}
          ticker={ticker ?? undefined}
          initialPage={page}
          viewerUserId={user.id}
        />
        <FeedList
          key={ticker ?? "discover"}
          initialPosts={initialPosts}
          initialNextCursor={page.nextCursor}
          viewerUserId={user.id}
          source={source}
          coinNameMap={coinNameMap}
          tickerPreviewMap={tickerPreviewMap}
          viewerFollowingMap={viewerFollowingMap}
          emptyState={<ExploreEmptyState ticker={ticker} />}
          commentsThreadProps={{
            viewerUserId: user.id,
            viewerProfile: {
              username: user.username,
              firstName: user.firstName,
              lastName: user.lastName,
              avatarUrl: user.avatarUrl,
              headline: user.headline,
            },
            liveMode: commentsConfig.liveModeFeed,
            pollIntervalSeconds: commentsConfig.pollIntervalSeconds,
            repliesInitialCount: commentsConfig.repliesInitialCount,
            maxBodyLength: commentsConfig.maxBodyLength,
          }}
        />
      </div>
    </div>
  );
}

async function ExploreEmptyState({ ticker }: { ticker: string | null }) {
  const tEmpty = await getTranslations("posts.empty_states");
  if (ticker) {
    return (
      <div className="bg-gc-bg-2 border border-gc-line rounded-gc p-8 flex flex-col items-center text-center gap-3">
        <div
          aria-hidden
          className="w-12 h-12 rounded-full bg-gc-accent/10 flex items-center justify-center text-gc-accent">
          <Search size={22} strokeWidth={1.75} />
        </div>
        <div>
          <p className="text-gc-fg font-medium">
            {tEmpty("explore_ticker_no_posts_title", { ticker: `$${ticker}` })}
          </p>
          <p className="text-sm text-gc-fg-muted mt-1 max-w-sm">
            {tEmpty("explore_ticker_no_posts_description")}
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="bg-gc-bg-2 border border-gc-line rounded-gc p-8 flex flex-col items-center text-center gap-3">
      <div
        aria-hidden
        className="w-12 h-12 rounded-full bg-gc-accent/10 flex items-center justify-center text-gc-accent">
        <Search size={22} strokeWidth={1.75} />
      </div>
      <div>
        <p className="text-gc-fg font-medium">
          {tEmpty("explore_no_posts_title")}
        </p>
        <p className="text-sm text-gc-fg-muted mt-1 max-w-sm">
          {tEmpty("explore_no_posts_description")}
        </p>
      </div>
    </div>
  );
}
