"use client";
// components/modules/posts/FeedList.tsx
//
// Lista paginata generica del feed. Server-rendered la first page,
// **infinite scroll automatico** via IntersectionObserver sul sentinel
// in coda alla lista: la prossima pagina viene fetched quando l'utente
// passa l'~80% scroll grazie a `rootMargin` esteso 800px. Il bottone
// "Carica altri" resta come fallback per accessibility (keyboard +
// screen reader users).
//
// Source-agnostic: il caller passa `source` discriminato (tab vs
// ticker) + empty state custom. Usato dalla Home (Following), dalla
// /explore (Discover) e dalla /explore?ticker= (Ticker filter).
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Compass } from "lucide-react";
import { loadMoreFeed } from "@/lib/modules/posts/feed-actions";
import type { FeedTab } from "@/lib/modules/posts/queries";
import type { PostCardData } from "@/lib/modules/posts/types";
import type { TickerPreviewData } from "@/lib/modules/posts/ticker-preview-actions";
import { findScrollParent } from "@/lib/hooks/use-is-stuck";
import { useResetableListState } from "@/lib/hooks/use-resetable-list-state";
import { usePostsError } from "@/lib/modules/posts/lib/use-posts-error";
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
  /** Mappa lower-name → SYMBOL per il match implicito nomi nel PostBody.
   *  Caricata dal Server Component padre, propagata a ogni PostCard. */
  coinNameMap?: Record<string, string>;
  /** Preview ticker pre-fetched server-side. Propagata al TickerHoverCard
   *  per zero round-trip al primo hover. */
  tickerPreviewMap?: Record<string, TickerPreviewData>;
};

export function FeedList(props: Props) {
  // useResetableListState: quando il server passa nuove initialPosts
  // (es. dopo router.refresh() dopo un soft-delete), lo state si reseta
  // e i post deleted spariscono dal feed. Senza, useState(initial)
  // tiene la lista vecchia (vedi feedback_initial_prop_state).
  const initialPage = useMemo(
    () => ({ rows: props.initialPosts, nextCursor: props.initialNextCursor }),
    [props.initialPosts, props.initialNextCursor],
  );
  const { rows: posts, cursor: nextCursor, appendRows } =
    useResetableListState<PostCardData>(initialPage);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const tErr = usePostsError();
  const tFeed = useTranslations("posts.feed");

  const onLoadMore = useCallback(() => {
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
        appendRows(res.data.posts, res.data.nextCursor);
      } else {
        // loadMoreFeed non ha retryAfter/field nel fail branch, basta key.
        setError(tErr(res.error));
      }
    });
  }, [nextCursor, isPending, props.source, appendRows, tErr]);

  // Infinite scroll + prefetch: IntersectionObserver sul sentinel in
  // fondo alla lista. `rootMargin: "0px 0px 800px 0px"` estende il
  // root verso il basso di 800px → l'observer fa scattare il fetch
  // quando l'utente è ancora 800px sopra la fine, dando tempo al
  // server di rispondere prima che si veda lo skeleton.
  useEffect(() => {
    const target = sentinelRef.current;
    if (!target || !nextCursor) return;
    // Trova lo scroll container vero — il (protected) layout ha
    // `<main overflow-y-auto>` come scroller interno, non la window.
    // Senza `root` esplicito l'observer guarderebbe la window viewport
    // e non si triggerebbe mai → infinite scroll rotto (bug visto su
    // /explore con 100 post: caricava solo i primi 20).
    const root = findScrollParent(target);
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onLoadMore();
      },
      { root, rootMargin: "0px 0px 800px 0px", threshold: 0 },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [nextCursor, onLoadMore]);

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
              coinNameMap={props.coinNameMap}
              tickerPreviewMap={props.tickerPreviewMap}
            />
          ))
        )}

        {/* Skeleton on prefetch — 2 card pulsanti in coda durante il
            fetch della prossima pagina così l'utente vede subito che
            sta arrivando contenuto. */}
        {isPending && nextCursor ? (
          <>
            <PostCardSkeleton />
            <PostCardSkeleton />
          </>
        ) : null}
      </div>

      {error ? (
        <p className="mt-3 text-xs text-gc-danger" role="alert">
          {error}
        </p>
      ) : null}

      {/* Sentinel invisibile per IntersectionObserver. Renderizzato solo
          se c'è ancora una prossima pagina da fetchare. */}
      {nextCursor ? (
        <>
          <div ref={sentinelRef} aria-hidden style={{ height: 1 }} />
          {/* Fallback button per accessibility: keyboard + screen reader
              users che non triggerano l'IntersectionObserver. Mostrato
              sempre, anche se l'auto-load di solito anticipa il click. */}
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={onLoadMore}
              disabled={isPending}
              className="px-4 py-1.5 rounded-full border border-gc-line text-sm text-gc-fg hover:bg-gc-bg-2 disabled:opacity-40">
              {isPending ? tFeed("loading_more") : tFeed("load_more")}
            </button>
          </div>
        </>
      ) : posts.length > 0 ? (
        <p className="mt-4 text-center text-xs text-gc-fg-muted">
          {tFeed("end_reached")}
        </p>
      ) : null}
    </section>
  );
}

function PostCardSkeleton() {
  return (
    <div
      aria-hidden
      className="relative bg-gc-bg-2 border border-gc-line rounded-xl p-5 animate-pulse">
      <div className="flex items-start gap-3 mb-3">
        <div className="w-10 h-10 rounded-full bg-gc-bg-3 shrink-0" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3 w-24 rounded bg-gc-bg-3" />
          <div className="h-2.5 w-16 rounded bg-gc-bg-3" />
        </div>
      </div>
      <div className="space-y-2 mt-4">
        <div className="h-3 w-full rounded bg-gc-bg-3" />
        <div className="h-3 w-5/6 rounded bg-gc-bg-3" />
        <div className="h-3 w-3/4 rounded bg-gc-bg-3" />
      </div>
      <div className="mt-4 flex items-center gap-6">
        <div className="h-6 w-12 rounded-full bg-gc-bg-3" />
        <div className="h-6 w-12 rounded-full bg-gc-bg-3" />
        <div className="h-6 w-12 rounded-full bg-gc-bg-3" />
      </div>
    </div>
  );
}

function FollowingEmptyState() {
  const tEmpty = useTranslations("posts.empty_states");
  return (
    <div className="bg-gc-bg-2 border border-gc-line rounded-xl p-8 flex flex-col items-center text-center gap-3">
      <div
        aria-hidden
        className="w-12 h-12 rounded-full bg-gc-accent/10 flex items-center justify-center text-gc-accent"
      >
        <Compass size={22} strokeWidth={1.75} />
      </div>
      <div>
        <p className="text-gc-fg font-medium">{tEmpty("following_home_title")}</p>
        <p className="text-sm text-gc-fg-muted mt-1 max-w-sm">
          {tEmpty("following_home_description")}
        </p>
      </div>
      <Link
        href="/explore"
        className="mt-2 px-4 py-1.5 rounded-full bg-gc-accent text-gc-bg-1 text-sm font-medium hover:brightness-95 transition"
      >
        {tEmpty("following_home_cta")}
      </Link>
    </div>
  );
}
