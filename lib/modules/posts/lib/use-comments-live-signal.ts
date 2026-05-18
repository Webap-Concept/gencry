"use client";
// lib/modules/posts/lib/use-comments-live-signal.ts
//
// Hook React per il segnale "X nuovi commenti" del thread di un post.
// 3 mode swap-in-place via prop / setting admin:
//
//   "subscribe" → 1 channel Supabase Postgres Changes su posts_comments
//                 WHERE post_id=eq.{postId} (INSERT only).
//   "poll"      → setInterval con fetch del count REALE via Server
//                 Action `pollCommentsSignalAction`. Gate su
//                 document.visibilityState (zero traffico in background).
//   "off"       → no-op. Refresh manuale.
//
// L'hook NON renderizza nulla — espone solo:
//   - newCount: numero di INSERT visti dopo `lastSyncAt`
//   - lastSyncAt: timestamp dell'ultima sync (manuale o iniziale)
//   - markSynced(): chiamato dal banner quando l'utente clicca "Mostra"
//   - dedupClientId(id, parentCommentId): registra optimistic ID per
//     skippare l'event del proprio commento appena pubblicato
//
// Hookable: per swappare il provider realtime, modifica
// `services/comments-realtime.ts`. Per swappare poll, modifica
// `pollCommentsSignalAction`. L'hook resta uguale.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  subscribeToCommentsForPost,
  type CommentRealtimeEvent,
} from "../services/comments-realtime";

export type CommentsLiveMode = "subscribe" | "poll" | "off";

export type UseCommentsLiveSignalOpts = {
  postId: string;
  mode: CommentsLiveMode;
  /** Visibility del post target. `public` → channel realtime public,
   *  nessun JWT richiesto. Altrimenti → channel private + setAuth via
   *  jwtFetcher. Mapping deciso nella architecture page §Realtime authz. */
  postIsPublic: boolean;
  /** Required quando postIsPublic=false. Ritorna un JWT custom firmato
   *  con SUPABASE_JWT_SECRET (Server Action generateRealtimeAuthToken). */
  jwtFetcher?: () => Promise<string | null>;
  /** Per "poll": intervallo in ms. Default 20000. */
  pollIntervalMs?: number;
  /** Per "poll": callback che ritorna il count attuale di nuovi commenti
   *  dal DB (cursor-based). Caller deve passare una Server Action o
   *  fetch wrappato. Riceve `since` come ISO date string. */
  fetchNewCount?: (since: string) => Promise<number>;
  /** Disabilita l'hook (es. utente non loggato). */
  enabled?: boolean;
};

export type UseCommentsLiveSignalReturn = {
  newCount: number;
  /** ISO date. Il counter conta gli INSERT dopo questo timestamp. */
  lastSyncAt: string;
  /** Reset del counter + bump del watermark. Da chiamare dopo il refetch. */
  markSynced: () => void;
  /** Manualmente incrementa il counter (opportuno per testing o casi limite). */
  bump: (n?: number) => void;
  /** Registra l'ID di un commento appena scritto in ottimistica:
   *  l'evento realtime corrispondente NON incrementerà il counter. */
  registerOwnComment: (commentId: string) => void;
};

const DEFAULT_POLL_INTERVAL_MS = 20_000;

export function useCommentsLiveSignal(
  opts: UseCommentsLiveSignalOpts,
): UseCommentsLiveSignalReturn {
  const enabled = opts.enabled ?? true;
  const [newCount, setNewCount] = useState(0);
  const [lastSyncAt, setLastSyncAt] = useState(() =>
    new Date().toISOString(),
  );

  // Dedup IDs dei propri commenti (ottimistici): gli eventi realtime
  // matchanti NON incrementano il counter. Set in ref per evitare
  // re-render quando si aggiunge un id.
  const ownCommentIds = useRef<Set<string>>(new Set());

  const markSynced = useCallback(() => {
    setNewCount(0);
    setLastSyncAt(new Date().toISOString());
    ownCommentIds.current.clear();
  }, []);

  const bump = useCallback((n = 1) => {
    setNewCount((c) => c + n);
  }, []);

  const registerOwnComment = useCallback((commentId: string) => {
    ownCommentIds.current.add(commentId);
  }, []);

  // ── Subscribe mode ─────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled || opts.mode !== "subscribe") return;
    const unsubscribe = subscribeToCommentsForPost({
      postId: opts.postId,
      isPublic: opts.postIsPublic,
      jwtFetcher: opts.jwtFetcher,
      onInsert: (event: CommentRealtimeEvent) => {
        if (ownCommentIds.current.has(event.commentId)) {
          ownCommentIds.current.delete(event.commentId);
          return;
        }
        setNewCount((c) => c + 1);
      },
    });
    return unsubscribe;
  }, [enabled, opts.mode, opts.postId, opts.postIsPublic, opts.jwtFetcher]);

  // ── Poll mode ──────────────────────────────────────────────────────
  // Gate su document.visibilityState: zero fetch quando il tab è hidden.
  useEffect(() => {
    if (!enabled || opts.mode !== "poll") return;
    if (!opts.fetchNewCount) return;

    const intervalMs = opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    let timer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    const tick = async () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }
      try {
        const since = lastSyncAt;
        const count = await opts.fetchNewCount!(since);
        if (cancelled) return;
        // Sottraiamo gli ID propri: l'API può non saperlo perché legge
        // count direttamente dal DB. Approssimazione safe: clamp ≥ 0.
        const adj = Math.max(0, count - ownCommentIds.current.size);
        setNewCount(adj);
      } catch {
        // Silenzioso: in caso di errore di rete il counter non si aggiorna.
        // Il banner resta sullo stato precedente — accettabile.
      }
    };

    // Fire immediato + intervallo.
    void tick();
    timer = setInterval(tick, intervalMs);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [enabled, opts.mode, opts.postId, opts.pollIntervalMs, opts.fetchNewCount, lastSyncAt]);

  return { newCount, lastSyncAt, markSynced, bump, registerOwnComment };
}
