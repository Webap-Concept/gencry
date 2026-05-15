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
import "server-only";
import { Suspense } from "react";
import type { Metadata } from "next";
import { Search } from "lucide-react";
import { getUser } from "@/lib/db/queries";
import {
  getFeedIds,
  getPostsByIds,
  getTickerFeedIds,
} from "@/lib/modules/posts/queries";
import { getCoinForCard } from "@/lib/modules/prices/queries";
import { FeedList } from "@/components/modules/posts/FeedList";
import { TrendingTickersRow } from "@/components/modules/posts/TrendingTickersRow";
import { NewPostsBannerSlot } from "@/components/modules/posts/NewPostsBannerSlot";
import { CoinSummaryCard } from "@/components/modules/coins/coin-summary-card";

export const metadata: Metadata = { title: "Esplora" };
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
  // del coin per il CoinSummaryCard sticky. Coin può essere null se
  // il ticker non è tracciato nel pricing module — empty state.
  const [page, coin] = await Promise.all([
    ticker
      ? getTickerFeedIds({ ticker, viewerUserId: user.id })
      : getFeedIds({ tab: "discover", viewerUserId: user.id }),
    ticker ? getCoinForCard(ticker) : Promise.resolve(null),
  ]);
  const initialPosts = await getPostsByIds(page.ids, { viewerUserId: user.id });

  const source = ticker
    ? ({ kind: "ticker", ticker } as const)
    : ({ kind: "tab", tab: "discover" } as const);

  return (
    <div className="max-w-2xl mx-auto py-6 px-4 space-y-4">
      <header>
        <h1 className="text-2xl font-semibold text-gc-fg">
          {ticker ? `Post su $${ticker}` : "Esplora"}
        </h1>
        <p className="text-sm text-gc-fg-3 mt-1">
          {ticker
            ? "Tutti i post pubblici che menzionano questo ticker."
            : "Post pubblici della community in ordine cronologico."}
        </p>
      </header>

      {/* Block 1 — Header dinamico:
          - Senza filtro → TrendingTickersRow (top 10 pill)
          - Con ticker tracciato → CoinSummaryCard (snapshot + sticky)
          - Con ticker non tracciato → fallback testuale, niente row */}
      {ticker ? (
        coin ? (
          <CoinSummaryCard coin={coin} />
        ) : (
          <div className="rounded-2xl border border-dashed border-gc-line bg-gc-bg-2 p-4 text-sm text-gc-fg-2">
            <strong>${ticker}</strong> non è ancora tracciato nel modulo
            prezzi — vedi sotto i post che lo menzionano.
          </div>
        )
      ) : (
        <Suspense fallback={null}>
          <TrendingTickersRow activeTicker={null} />
        </Suspense>
      )}

      {/* Block 2 — Realtime banner slot (v1 no-op, v2 Tier 2). */}
      <NewPostsBannerSlot
        feedKind={ticker ? "ticker" : "discover"}
        ticker={ticker ?? undefined}
        initialPage={page}
      />

      {/* Block 3 — Feed. Key sul ticker resetta lo state accumulato
          quando l'utente cambia filtro senza navigation (es. click su
          altro ticker pill mentre era già filtrato). */}
      <FeedList
        key={ticker ?? "discover"}
        initialPosts={initialPosts}
        initialNextCursor={page.nextCursor}
        viewerUserId={user.id}
        source={source}
        emptyState={
          <ExploreEmptyState ticker={ticker} />
        }
      />
    </div>
  );
}

function ExploreEmptyState({ ticker }: { ticker: string | null }) {
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
            Nessun post su ${ticker}
          </p>
          <p className="text-sm text-gc-fg-muted mt-1 max-w-sm">
            Non c'è ancora nessun post pubblico che menziona questo ticker.
            Sii il primo a parlarne.
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
        <p className="text-gc-fg font-medium">Nessun post da esplorare</p>
        <p className="text-sm text-gc-fg-muted mt-1 max-w-sm">
          Non c'è ancora niente di pubblico. Pubblica il primo post per
          dare il via.
        </p>
      </div>
    </div>
  );
}
