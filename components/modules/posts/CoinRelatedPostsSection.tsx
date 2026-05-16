// components/modules/posts/CoinRelatedPostsSection.tsx
//
// Sezione "Post recenti su $TICKER" mostrata in fondo a /coins/[symbol].
// Carica i primi N post che menzionano il ticker (visibility-filtered
// in base al viewer: anon = solo public, loggato = public+members);
// link "Vedi tutti" verso /explore?ticker=<SYMBOL>.
//
// Server Component pure. Riusa getTickerFeedIds + getPostsByIds dal
// modulo posts: stessa pipeline del feed, niente duplicazione logic
// di visibility/block. Block-filtered se viewer è loggato.
import "server-only";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight, MessageCircle } from "lucide-react";
import { getUser } from "@/lib/db/queries";
import {
  getTickerFeedIds,
  getPostsByIds,
} from "@/lib/modules/posts/queries";
import { getCoinNameMap } from "@/lib/modules/prices/queries";
import { getTickerPreviewBatch } from "@/lib/modules/posts/ticker-preview-actions";
import { collectVisibleTickers } from "@/lib/modules/posts/lib/collect-visible-tickers";
import { PostCard } from "@/components/modules/posts/PostCard";

export async function CoinRelatedPostsSection({
  symbol,
  limit = 5,
}: {
  /** UPPERCASE già normalizzato (es. "BTC"). */
  symbol: string;
  limit?: number;
}) {
  const user = await getUser();
  const [page, coinNameMap] = await Promise.all([
    getTickerFeedIds({
      ticker: symbol,
      viewerUserId: user?.id,
      pageSize: limit,
    }),
    getCoinNameMap(),
  ]);
  const posts = await getPostsByIds(page.ids, { viewerUserId: user?.id });
  const tickerPreviewMap = await getTickerPreviewBatch(
    collectVisibleTickers(posts),
  );
  const tCoin = await getTranslations("posts.coin_related");

  return (
    <section
      aria-labelledby="coin-posts-heading"
      className="rounded-2xl p-5 bg-gc-bg-2 border border-gc-line space-y-4">
      <header className="flex items-center justify-between gap-3">
        <h2
          id="coin-posts-heading"
          className="flex items-center gap-2 text-sm font-semibold text-gc-fg">
          <MessageCircle size={15} strokeWidth={1.75} aria-hidden />
          {tCoin("section_title", { symbol: `$${symbol}` })}
        </h2>
        {posts.length > 0 ? (
          <Link
            href={`/explore?ticker=${symbol}`}
            prefetch={false}
            className="inline-flex items-center gap-1 text-xs font-medium text-gc-accent hover:underline">
            {tCoin("see_all")}
            <ArrowRight size={12} strokeWidth={2} aria-hidden />
          </Link>
        ) : null}
      </header>

      {posts.length === 0 ? (
        <EmptyState symbol={symbol} authed={Boolean(user)} />
      ) : (
        <div className="space-y-3">
          {posts.map((p) => (
            <PostCard
              key={p.id}
              post={p}
              isAuthor={p.author.id === user?.id}
              coinNameMap={coinNameMap}
              tickerPreviewMap={tickerPreviewMap}
            />
          ))}
        </div>
      )}
    </section>
  );
}

async function EmptyState({
  symbol,
  authed,
}: {
  symbol: string;
  authed: boolean;
}) {
  const t = await getTranslations("posts");
  const tEmpty = await getTranslations("posts.empty_states");
  return (
    <div className="text-center py-6 space-y-2">
      <p className="text-sm text-gc-fg-2">
        {tEmpty("ticker_no_posts_prefix")}
        <strong>${symbol}</strong>
        {tEmpty("ticker_no_posts_suffix")}
      </p>
      {authed ? (
        <p className="text-xs text-gc-fg-3">
          {tEmpty("ticker_create_cta_authed_prefix")}
          <code className="font-mono">${symbol}</code>
          {tEmpty("ticker_create_cta_authed_suffix")}
        </p>
      ) : (
        <p className="text-xs text-gc-fg-3">
          <Link
            href="/sign-up"
            prefetch={false}
            className="text-gc-accent hover:underline">
            {t("common.sign_up")}
          </Link>
          {tEmpty("ticker_create_cta_anon_suffix")}
        </p>
      )}
    </div>
  );
}
