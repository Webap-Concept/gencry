"use client";
// components/modules/posts/FeedList.tsx
//
// Lista dei post + tabs Discover/Following + load-more cursor-based.
// La first page arriva server-rendered (RSC) → niente flash di
// scheletro al primo paint. Le pagine successive sono caricate via la
// Server Action `loadMoreFeed`.
//
// Tab persistence: localStorage `posts.feed.tab`. Default = la tab che
// il server ha già renderizzato (così niente flicker al mount).
import { useEffect, useState, useTransition } from "react";
import {
  loadMoreFeed,
  type LoadMoreFeedInput,
} from "@/lib/modules/posts/feed-actions";
import type { PostCardData } from "@/lib/modules/posts/types";
import type { FeedTab } from "@/lib/modules/posts/queries";
import { PostCard } from "./PostCard";

type Props = {
  initialTab: FeedTab;
  initialPosts: PostCardData[];
  initialNextCursor: string | null;
  /** ID utente loggato. Necessario per marcare `isAuthor` sulle proprie card. */
  viewerUserId: string;
};

const STORAGE_KEY = "posts.feed.tab";

export function FeedList(props: Props) {
  const [tab, setTab] = useState<FeedTab>(props.initialTab);
  const [posts, setPosts] = useState<PostCardData[]>(props.initialPosts);
  const [nextCursor, setNextCursor] = useState<string | null>(
    props.initialNextCursor,
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Restore tab preference dopo il primo mount. NON cambia la prima
  // pagina renderizzata dal server (per evitare flicker); se l'utente
  // preferiva l'altra tab, mostra un pulsante "Switch" come hint, o
  // semplicemente verrà rispettata al prossimo navigate. Per la v1
  // teniamo semplice: salviamo SOLO al click, non switchiamo al mount.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as FeedTab | null;
      if (saved && saved !== tab && (saved === "discover" || saved === "following")) {
        // Switch silenzioso al mount: re-fetch la prima pagina della tab salvata.
        switchTab(saved, /* resetting */ true);
      }
    } catch {
      // localStorage può throw in browser con private mode su Safari, no-op.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const switchTab = (next: FeedTab, resetting = false) => {
    if (!resetting && next === tab) return;
    setTab(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // no-op
    }
    setError(null);
    setPosts([]);
    setNextCursor(null);
    startTransition(async () => {
      // Per la tab Following carichiamo da zero (la first page server era
      // della tab iniziale). Riusiamo loadMoreFeed con cursor vuoto? No,
      // ha bisogno di cursor. Semplifichiamo: lasciamo che il primo
      // batch arrivi via load-more con cursor null = sentinel "prima pagina".
      const res = await callLoadMore({ tab: next, cursor: "" });
      if (res.ok) {
        setPosts(res.data.posts);
        setNextCursor(res.data.nextCursor);
      } else {
        setError(res.error);
      }
    });
  };

  const onLoadMore = () => {
    if (!nextCursor || isPending) return;
    setError(null);
    startTransition(async () => {
      const res = await callLoadMore({ tab, cursor: nextCursor });
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
      <div className="flex gap-1 mb-3 border-b border-gc-line">
        <TabButton
          active={tab === "discover"}
          onClick={() => switchTab("discover")}
          label="Discover"
        />
        <TabButton
          active={tab === "following"}
          onClick={() => switchTab("following")}
          label="Following"
        />
      </div>

      <div className="space-y-3">
        {posts.length === 0 && !isPending ? (
          <EmptyState tab={tab} />
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

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="tab"
      aria-selected={active}
      className={`px-3 py-2 text-sm relative ${
        active
          ? "text-gc-fg font-medium"
          : "text-gc-fg-muted hover:text-gc-fg"
      }`}
    >
      {label}
      {active ? (
        <span className="absolute left-3 right-3 -bottom-px h-[2px] bg-gc-accent rounded-full" />
      ) : null}
    </button>
  );
}

function EmptyState({ tab }: { tab: FeedTab }) {
  if (tab === "following") {
    return (
      <div className="text-center py-12 text-gc-fg-muted">
        <p className="text-sm">Non segui ancora nessuno.</p>
        <p className="text-xs mt-1">
          Esplora Discover per trovare persone interessanti.
        </p>
      </div>
    );
  }
  return (
    <div className="text-center py-12 text-gc-fg-muted text-sm">
      Nessun post ancora. Sii il primo a scriverne uno.
    </div>
  );
}

/**
 * loadMoreFeed accetta solo cursor non-empty; per il "primo batch dopo
 * tab switch" usiamo cursor="" come sentinel e qui lo traduciamo a
 * "prima pagina" via una chiamata client→server alternativa.
 *
 * Implementazione: se cursor="", chiamiamo loadMoreFeed con un cursor
 * fittizio molto avanti nel tempo (effettivamente "tutto prima di now")
 * — workaround temporaneo. Lo correggiamo in PR-7 quando aggiungiamo
 * un endpoint dedicato "first-page-fetch" per il tab switch.
 */
async function callLoadMore(input: LoadMoreFeedInput) {
  if (input.cursor !== "") return loadMoreFeed(input);
  // Cursor fittizio molto avanti nel tempo → keyset clause non filtra
  // niente, ritorna la prima pagina cronologica. ms = anno 9999.
  const farFuture = btoa(`${253402300799000}:00000000-0000-0000-0000-000000000000`)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return loadMoreFeed({ tab: input.tab, cursor: farFuture });
}
