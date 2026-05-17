"use client";
// components/modules/posts/CommentsThread.tsx
//
// Orchestratore del thread commenti. Gestisce:
//   - Lazy fetch (inline expand dal feed) o SSR-prefetched (page /post/[id])
//   - Banner realtime "X nuovi commenti" (subscribe / poll / off via prop)
//   - Composer root + composer reply inline
//   - Pagination "Mostra altri commenti" (root) + "Mostra altre N risposte"
//   - Optimistic prepend / edit / delete con dedup realtime
//
// Pattern (vedi project_module_posts_architecture §Comments):
//   - Visual 2 livelli (root + reply indented)
//   - Schema flat (parent_comment_id), reply-of-reply collassano a livello 2
//   - Realtime fire SOLO sugli INSERT (no edit/delete signal)
//
// Performance:
//   - Bundle lazy-loaded via `dynamic()` dai caller (PostCard / page)
//   - Initial data può arrivare prefetched (page detail) o lazy (PostCard)
//   - getInitialRepliesForRoots batched (window function) — no N+1
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, Loader2 } from "lucide-react";
import {
  createComment as createCommentAction,
  editComment as editCommentAction,
  softDeleteComment as softDeleteCommentAction,
  generateRealtimeAuthToken,
  loadInitialCommentsAction,
  loadMoreRootCommentsAction,
  loadMoreRepliesAction,
  pollCommentsSignalAction,
} from "@/lib/modules/posts/actions";
import type {
  CommentCardData,
  CommentRootCardData,
} from "@/lib/modules/posts/types";
import {
  useCommentsLiveSignal,
  type CommentsLiveMode,
} from "@/lib/modules/posts/lib/use-comments-live-signal";
import { CommentItem } from "./CommentItem";
import { CommentComposer } from "./CommentComposer";
import { CommentsBanner } from "./CommentsBanner";

export type CommentsThreadInitialData = {
  root: CommentRootCardData[];
  replies: Record<string, CommentCardData[]>;
  nextRootCursor: string | null;
};

export type CommentsThreadProps = {
  postId: string;
  /** Visibility del post target. Determina channel mode realtime
   *  (public vs private). Vedi sezione "Realtime authz" della
   *  architecture page del modulo posts. */
  postVisibility: "public" | "members" | "followers" | "private";
  viewerUserId?: string;
  /** Profile del viewer per popolare l'oggetto ottimistico dei commenti
   *  appena inviati (avatar + display name) senza dover fare refresh.
   *  Caricato dai Server Component padri via getUser(). */
  viewerProfile?: {
    username: string | null;
    firstName: string | null;
    lastName: string | null;
    avatarUrl: string | null;
  };
  canModerate?: boolean;
  /** Realtime mode (subscribe/poll/off) letta da app_settings dal caller. */
  liveMode: CommentsLiveMode;
  pollIntervalSeconds: number;
  /** Numero di reply prefetched per root. Default 3 da config. */
  repliesInitialCount: number;
  /** Limite body commento (allineato CHECK schema). */
  maxBodyLength: number;
  /** Edit window in ms (da config). */
  editWindowMs: number;
  /** Initial data SSR-prefetched (page detail) o null per lazy fetch
   *  (PostCard inline expand). */
  initialData?: CommentsThreadInitialData | null;
  /** Mappa name → SYMBOL per inline match coin names nel body. */
  coinNameMap?: Record<string, string>;
};

export function CommentsThread({
  postId,
  postVisibility,
  viewerUserId,
  viewerProfile,
  canModerate,
  liveMode,
  pollIntervalSeconds,
  repliesInitialCount,
  maxBodyLength,
  editWindowMs,
  initialData,
  coinNameMap,
}: CommentsThreadProps) {
  const t = useTranslations("posts.comments");
  const postIsPublic = postVisibility === "public";

  const [root, setRoot] = useState<CommentRootCardData[]>(
    initialData?.root ?? [],
  );
  // Reply by root id. Aggiornata lazily quando l'utente espande "Mostra altre".
  const [repliesByRoot, setRepliesByRoot] = useState<
    Record<string, CommentCardData[]>
  >(initialData?.replies ?? {});
  const [repliesCursorByRoot, setRepliesCursorByRoot] = useState<
    Record<string, string | null>
  >({});
  const [nextRootCursor, setNextRootCursor] = useState<string | null>(
    initialData?.nextRootCursor ?? null,
  );
  const [loadingMoreRoot, setLoadingMoreRoot] = useState(false);
  const [loadingRepliesFor, setLoadingRepliesFor] = useState<string | null>(
    null,
  );
  const [initialLoading, setInitialLoading] = useState(!initialData);
  const [initialError, setInitialError] = useState<string | null>(null);

  // Reply-target: quale root l'utente sta rispondendo. null = composer root.
  const [replyingTo, setReplyingTo] = useState<{
    rootId: string;
    replyToHandle: string;
  } | null>(null);

  // ── Initial lazy fetch (PostCard inline expand) ───────────────────────
  useEffect(() => {
    if (initialData) return;
    let cancelled = false;
    setInitialLoading(true);
    setInitialError(null);
    void loadInitialCommentsAction({ postId, perRoot: repliesInitialCount }).then(
      (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setInitialError(res.error);
          setInitialLoading(false);
          return;
        }
        setRoot(res.data!.root);
        setRepliesByRoot(res.data!.replies);
        setNextRootCursor(res.data!.nextRootCursor);
        setInitialLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [initialData, postId, repliesInitialCount]);

  // ── Realtime banner signal ─────────────────────────────────────────────
  const fetchNewCount = useCallback(
    async (since: string) => {
      const res = await pollCommentsSignalAction({ postId, since });
      return res.ok ? res.data!.newCount : 0;
    },
    [postId],
  );

  // JWT fetcher per channel private (post visibility != public). Cache
  // locale con TTL ~50min: il token Server Action scade in 1h, refresh
  // anticipato evita race con la subscription Realtime.
  const jwtCacheRef = useRef<{ token: string; expiresAt: number } | null>(
    null,
  );
  const jwtFetcher = useCallback(async (): Promise<string | null> => {
    const cached = jwtCacheRef.current;
    const now = Math.floor(Date.now() / 1000);
    if (cached && cached.expiresAt - now > 600 /* 10min margine */) {
      return cached.token;
    }
    const res = await generateRealtimeAuthToken();
    if (!res.ok || !res.data) return null;
    jwtCacheRef.current = res.data;
    return res.data.token;
  }, []);

  const signal = useCommentsLiveSignal({
    postId,
    postIsPublic,
    jwtFetcher: postIsPublic ? undefined : jwtFetcher,
    mode: liveMode,
    pollIntervalMs: pollIntervalSeconds * 1000,
    fetchNewCount: liveMode === "poll" ? fetchNewCount : undefined,
    enabled: Boolean(viewerUserId) || (postIsPublic && liveMode !== "off"),
  });

  // Banner click → refetch del primo page di root (con re-merge per non
  // duplicare quelli già in lista).
  const handleBannerClick = useCallback(async () => {
    // Refetch della prima page (cursor=undefined) e merge dedup.
    const res = await loadInitialCommentsAction({
      postId,
      perRoot: repliesInitialCount,
    });
    if (!res.ok) return;
    setRoot((prev) => {
      const existingIds = new Set(prev.map((c) => c.id));
      const fresh = res.data!.root.filter((c) => !existingIds.has(c.id));
      // DESC ordering: più recente in cima
      return [...fresh, ...prev].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    });
    setRepliesByRoot((prev) => ({ ...res.data!.replies, ...prev }));
    setNextRootCursor((cur) => res.data!.nextRootCursor ?? cur);
    signal.markSynced();
  }, [postId, repliesInitialCount, signal]);

  // ── Submit nuovo commento (root o reply) ──────────────────────────────
  const handleSubmit = useCallback(
    async (body: string, parentCommentId: string | null) => {
      const res = await createCommentAction({ postId, body, parentCommentId });
      if (!res.ok) return { ok: false as const, error: res.error };

      const newId = res.data!.commentId;
      signal.registerOwnComment(newId);

      // Costruiamo un oggetto ottimistico (l'API non lo ritorna full).
      // Usiamo viewerProfile passato dal Server Component padre per
      // avere subito avatar + display name corretti senza refresh.
      const optimistic: CommentRootCardData = {
        id: newId,
        postId,
        parentCommentId,
        author: {
          id: viewerUserId ?? "",
          username: viewerProfile?.username ?? null,
          firstName: viewerProfile?.firstName ?? null,
          lastName: viewerProfile?.lastName ?? null,
          avatarUrl: viewerProfile?.avatarUrl ?? null,
        },
        body,
        editedAt: null,
        createdAt: new Date(),
        repliesCount: 0,
      };

      if (parentCommentId) {
        // Reply: prepend (DESC ordering — i nuovi vanno in cima), incrementa repliesCount
        setRepliesByRoot((prev) => ({
          ...prev,
          [parentCommentId]: [optimistic, ...(prev[parentCommentId] ?? [])],
        }));
        setRoot((prev) =>
          prev.map((c) =>
            c.id === parentCommentId
              ? { ...c, repliesCount: c.repliesCount + 1 }
              : c,
          ),
        );
        setReplyingTo(null);
      } else {
        // Root: prepend (DESC ordering — più recente in cima)
        setRoot((prev) => [optimistic, ...prev]);
      }
      return { ok: true as const };
    },
    [postId, signal, viewerUserId, viewerProfile],
  );

  // ── Edit ──────────────────────────────────────────────────────────────
  const handleEdit = useCallback(
    async (commentId: string, newBody: string) => {
      const res = await editCommentAction({ commentId, body: newBody });
      if (!res.ok) return { ok: false as const, error: res.error };
      // Update locale
      setRoot((prev) =>
        prev.map((c) =>
          c.id === commentId ? { ...c, body: newBody, editedAt: new Date() } : c,
        ),
      );
      setRepliesByRoot((prev) => {
        const next: typeof prev = {};
        for (const [rootId, replies] of Object.entries(prev)) {
          next[rootId] = replies.map((r) =>
            r.id === commentId ? { ...r, body: newBody, editedAt: new Date() } : r,
          );
        }
        return next;
      });
      return { ok: true as const };
    },
    [],
  );

  // ── Delete ────────────────────────────────────────────────────────────
  const handleDelete = useCallback(
    async (commentId: string, isRoot: boolean) => {
      const res = await softDeleteCommentAction({ commentId });
      if (!res.ok) return { ok: false as const, error: res.error };
      if (isRoot) {
        setRoot((prev) => {
          const target = prev.find((c) => c.id === commentId);
          if (!target) return prev;
          const hasReplies = (repliesByRoot[commentId]?.length ?? 0) > 0;
          if (hasReplies) {
            // Tombstone: mantieni la root con body sostituito
            return prev.map((c) =>
              c.id === commentId
                ? {
                    ...c,
                    body: "",
                    editedAt: null,
                  }
                : c,
            );
          }
          // Hard-hide
          return prev.filter((c) => c.id !== commentId);
        });
      } else {
        // Reply: rimuovi dalla lista del root e decrementa repliesCount
        setRepliesByRoot((prev) => {
          const next: typeof prev = {};
          for (const [rootId, replies] of Object.entries(prev)) {
            next[rootId] = replies.filter((r) => r.id !== commentId);
          }
          return next;
        });
        setRoot((prev) =>
          prev.map((c) => {
            const replies = repliesByRoot[c.id] ?? [];
            const wasMine = replies.some((r) => r.id === commentId);
            if (!wasMine) return c;
            return { ...c, repliesCount: Math.max(0, c.repliesCount - 1) };
          }),
        );
      }
      return { ok: true as const };
    },
    [repliesByRoot],
  );

  // ── "Mostra altri commenti" (root pagination) ─────────────────────────
  async function handleLoadMoreRoot() {
    if (!nextRootCursor || loadingMoreRoot) return;
    setLoadingMoreRoot(true);
    const res = await loadMoreRootCommentsAction({
      postId,
      cursor: nextRootCursor,
    });
    setLoadingMoreRoot(false);
    if (!res.ok) return;
    setRoot((prev) => [...prev, ...res.data!.root]);
    setRepliesByRoot((prev) => ({ ...prev, ...res.data!.replies }));
    setNextRootCursor(res.data!.nextRootCursor);
  }

  // ── "Mostra altre N risposte" (reply pagination per root) ─────────────
  async function handleLoadMoreReplies(rootId: string) {
    if (loadingRepliesFor === rootId) return;
    const cursor = repliesCursorByRoot[rootId];
    // Se non c'è cursor ed esiste già una lista, calcoliamo il cursor dalla
    // ultima reply visibile. Se non c'è cursor e niente lista, è il primo
    // fetch oltre i prefetched 3 → passiamo cursor=undefined.
    setLoadingRepliesFor(rootId);
    const res = await loadMoreRepliesAction({
      parentCommentId: rootId,
      cursor: cursor ?? undefined,
    });
    setLoadingRepliesFor(null);
    if (!res.ok) return;
    setRepliesByRoot((prev) => {
      const existing = prev[rootId] ?? [];
      const existingIds = new Set(existing.map((r) => r.id));
      const fresh = res.data!.replies.filter((r) => !existingIds.has(r.id));
      return { ...prev, [rootId]: [...existing, ...fresh] };
    });
    setRepliesCursorByRoot((prev) => ({
      ...prev,
      [rootId]: res.data!.nextCursor,
    }));
  }

  // ── Render ────────────────────────────────────────────────────────────
  if (initialLoading) {
    return (
      <div className="py-6 flex items-center justify-center text-gc-fg-muted text-sm">
        <Loader2 className="animate-spin mr-2" size={14} />
        {t("loading")}
      </div>
    );
  }
  if (initialError) {
    return (
      <div className="py-4 text-sm text-gc-neg text-center">{initialError}</div>
    );
  }

  const composerEnabled = Boolean(viewerUserId);

  return (
    <div className="mt-3 space-y-3">
      {/* Banner realtime "X nuovi commenti" — non-disruptive */}
      <CommentsBanner count={signal.newCount} onClick={handleBannerClick} />

      {/* Composer root (sempre in cima per dare visibilità all'azione) */}
      {composerEnabled && !replyingTo ? (
        <CommentComposer
          onSubmit={(body) => handleSubmit(body, null)}
          maxBodyLength={maxBodyLength}
        />
      ) : null}

      {/* Lista root + reply */}
      {root.length === 0 ? (
        <p className="py-4 text-center text-sm text-gc-fg-muted">{t("empty")}</p>
      ) : (
        <ul className="space-y-4 list-none">
          {root.map((c) => {
            const replies = repliesByRoot[c.id] ?? [];
            const isTombstone = !c.body && replies.length > 0;
            const totalReplies = c.repliesCount;
            const shown = replies.length;
            const hiddenReplies = Math.max(0, totalReplies - shown);
            return (
              <li key={c.id} className="space-y-2">
                <CommentItem
                  comment={c}
                  variant="root"
                  viewerUserId={viewerUserId}
                  canModerate={canModerate}
                  editWindowMs={editWindowMs}
                  isDeletedTombstone={isTombstone}
                  onReplyClick={
                    composerEnabled
                      ? () =>
                          setReplyingTo({
                            rootId: c.id,
                            replyToHandle: c.author.username
                              ? `@${c.author.username}`
                              : "",
                          })
                      : undefined
                  }
                  onEdit={(newBody) => handleEdit(c.id, newBody)}
                  onDelete={() => handleDelete(c.id, true)}
                  coinNameMap={coinNameMap}
                />

                {/* Replies */}
                {replies.length > 0 ? (
                  <ul className="space-y-3 list-none">
                    {replies.map((r) => (
                      <li key={r.id}>
                        <CommentItem
                          comment={r}
                          variant="reply"
                          viewerUserId={viewerUserId}
                          canModerate={canModerate}
                          editWindowMs={editWindowMs}
                          onEdit={(newBody) => handleEdit(r.id, newBody)}
                          onDelete={() => handleDelete(r.id, false)}
                          coinNameMap={coinNameMap}
                        />
                      </li>
                    ))}
                  </ul>
                ) : null}

                {/* Show-more replies */}
                {hiddenReplies > 0 ? (
                  <button
                    type="button"
                    onClick={() => handleLoadMoreReplies(c.id)}
                    disabled={loadingRepliesFor === c.id}
                    className="ml-9 inline-flex items-center gap-1 text-xs text-gc-fg-muted hover:text-gc-fg transition"
                  >
                    {loadingRepliesFor === c.id ? (
                      <Loader2 className="animate-spin" size={12} />
                    ) : (
                      <ChevronDown size={12} strokeWidth={1.75} />
                    )}
                    {t("show_more_replies", { count: hiddenReplies })}
                  </button>
                ) : null}

                {/* Reply composer inline (solo per il root che si sta rispondendo) */}
                {replyingTo?.rootId === c.id && composerEnabled ? (
                  <div className="ml-9">
                    <CommentComposer
                      onSubmit={(body) => handleSubmit(body, c.id)}
                      maxBodyLength={maxBodyLength}
                      replyToHandle={replyingTo.replyToHandle}
                      onCancel={() => setReplyingTo(null)}
                      compact
                      autoFocus
                    />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {/* Load-more root */}
      {nextRootCursor ? (
        <button
          type="button"
          onClick={handleLoadMoreRoot}
          disabled={loadingMoreRoot}
          className="w-full py-2 text-sm text-gc-fg-muted hover:text-gc-fg hover:bg-gc-bg-3 rounded-gc-sm transition flex items-center justify-center gap-2"
        >
          {loadingMoreRoot ? (
            <Loader2 className="animate-spin" size={14} />
          ) : (
            <ChevronDown size={14} strokeWidth={1.75} />
          )}
          {t("load_more")}
        </button>
      ) : null}
    </div>
  );
}

// Skeleton minimale per Suspense fallback quando il caller la wrappa.
export function CommentsThreadSkeleton() {
  return (
    <div className="mt-3 space-y-4 animate-pulse">
      <div className="h-12 rounded-gc-sm bg-gc-bg-3/40" />
      <div className="space-y-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="flex gap-2.5">
            <div className="w-9 h-9 rounded-full bg-gc-bg-3/40" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-32 bg-gc-bg-3/40 rounded" />
              <div className="h-3 w-full bg-gc-bg-3/40 rounded" />
              <div className="h-3 w-4/5 bg-gc-bg-3/40 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
