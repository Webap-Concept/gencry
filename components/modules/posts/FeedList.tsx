"use client";
// components/modules/posts/FeedList.tsx
//
// Lista paginata generica del feed. Server-rendered la first page,
// "Carica altri" client-side append via Server Action `loadMoreFeed`.
//
// Source-agnostic: il caller passa `source` discriminato (tab vs
// ticker) + empty state custom. Usato dalla Home (Following), dalla
// /explore (Discover) e dalla /explore?ticker= (Ticker filter).
import { useState, useTransition } from "react";
import Link from "next/link";
import { Compass } from "lucide-react";
import { loadMoreFeed } from "@/lib/modules/posts/feed-actions";
import type { FeedTab } from "@/lib/modules/posts/queries";
import type { PostCardData } from "@/lib/modules/posts/types";
import { PostCard } from "./PostCard";

export type FeedListSource =
  | { kind: "tab"; tab: FeedTab }
  | { kind: "ticker"; ticker: string };

type Props = {
  initialPosts: PostCardData[];
  initialNextCursor: string | null;
  /** ID utente loggato. Necessario per marcare `isAuthor` sulle proprie card. */
  viewerUserId: string;
  /** Origine del feed: tab discover/following oppure filtro per ticker. */
  source: FeedListSource;
  /** Empty state custom (es. "Nessun post su $BTC" vs "La tua home è vuota"). */
  emptyState?: React.ReactNode;
};

export function FeedList(props: Props) {
  const [posts, setPosts] = useState<PostCardData[]>(props.initialPosts);
  const [nextCursor, setNextCursor] = useState<string | null>(
    props.initialNextCursor,
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onLoadMore = () => {
    if (!nextCursor || isPending) return;
    setError(null);
    startTransition(async () => {
      const input =
        props.source.kind === "tab"
          ? { kind: "tab" as const, tab: props.source.tab, cursor: nextCursor }
          : {
              kind: "ticker" as const,
              ticker: props.source.ticker,
              cursor: nextCursor,
            };
      const res = await loadMoreFeed(input);
      if (res.ok) {
        setPosts((prev) => [...prev, ...res.data.posts]);
        setNextCursor(res.data.nextCursor);
      } else {
        setError(res.error);
      }
    });
  };

  return (
    <section aria-label="Feed">
      <div className="space-y-3">
        {posts.length === 0 && !isPending ? (
          props.emptyState ?? <FollowingEmptyState />
        ) : (
          posts.map((p) => (
            <PostCard
              key={p.id}
              post={p}
              isAuthor={p.author.id === props.viewerUserId}
            />
          ))
        )}
      </div>

      {error ? (
        <p className="mt-3 text-xs text-gc-danger" role="alert">
          {error}
        </p>
      ) : null}

      {nextCursor ? (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={isPending}
            className="px-4 py-1.5 rounded-full border border-gc-line text-sm text-gc-fg hover:bg-gc-bg-2 disabled:opacity-40"
          >
            {isPending ? "Carico…" : "Carica altri"}
          </button>
        </div>
      ) : posts.length > 0 ? (
        <p className="mt-4 text-center text-xs text-gc-fg-muted">
          Hai visto tutto.
        </p>
      ) : null}
    </section>
  );
}

function FollowingEmptyState() {
  return (
    <div className="bg-gc-bg-2 border border-gc-line rounded-gc p-8 flex flex-col items-center text-center gap-3">
      <div
        aria-hidden
        className="w-12 h-12 rounded-full bg-gc-accent/10 flex items-center justify-center text-gc-accent"
      >
        <Compass size={22} strokeWidth={1.75} />
      </div>
      <div>
        <p className="text-gc-fg font-medium">La tua home è vuota</p>
        <p className="text-sm text-gc-fg-muted mt-1 max-w-sm">
          Qui vedrai i post delle persone che segui. Inizia a esplorare per
          trovare profili e contenuti che ti interessano.
        </p>
      </div>
      <Link
        href="/explore"
        className="mt-2 px-4 py-1.5 rounded-full bg-gc-accent text-gc-bg-1 text-sm font-medium hover:brightness-95 transition"
      >
        Vai su Esplora
      </Link>
    </div>
  );
}
