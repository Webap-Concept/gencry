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
import { ArrowRight, MessageCircle } from "lucide-react";
import { getUser } from "@/lib/db/queries";
import {
  getTickerFeedIds,
  getPostsByIds,
} from "@/lib/modules/posts/queries";
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
  const page = await getTickerFeedIds({
    ticker: symbol,
    viewerUserId: user?.id,
    pageSize: limit,
  });
  const posts = await getPostsByIds(page.ids, { viewerUserId: user?.id });

  return (
    <section
      aria-labelledby="coin-posts-heading"
      className="rounded-2xl p-5 bg-gc-bg-2 border border-gc-line space-y-4">
      <header className="flex items-center justify-between gap-3">
        <h2
          id="coin-posts-heading"
          className="flex items-center gap-2 text-sm font-semibold text-gc-fg">
          <MessageCircle size={15} strokeWidth={1.75} aria-hidden />
          Post recenti su ${symbol}
        </h2>
        {posts.length > 0 ? (
          <Link
            href={`/explore?ticker=${symbol}`}
            prefetch={false}
            className="inline-flex items-center gap-1 text-xs font-medium text-gc-accent hover:underline">
            Vedi tutti
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
            />
          ))}
        </div>
      )}
    </section>
  );
}

function EmptyState({
  symbol,
  authed,
}: {
  symbol: string;
  authed: boolean;
}) {
  return (
    <div className="text-center py-6 space-y-2">
      <p className="text-sm text-gc-fg-2">
        Nessun post ha ancora parlato di <strong>${symbol}</strong>.
      </p>
      {authed ? (
        <p className="text-xs text-gc-fg-3">
          Inizia tu la conversazione — apri un nuovo post col tag{" "}
          <code className="font-mono">${symbol}</code>.
        </p>
      ) : (
        <p className="text-xs text-gc-fg-3">
          <Link
            href="/sign-up"
            prefetch={false}
            className="text-gc-accent hover:underline">
            Iscriviti
          </Link>{" "}
          per aprire la conversazione.
        </p>
      )}
    </div>
  );
}
