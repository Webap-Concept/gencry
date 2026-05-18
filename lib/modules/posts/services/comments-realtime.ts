"use client";
// lib/modules/posts/services/comments-realtime.ts
//
// Provider hookable per il segnale realtime dei commenti.
//
// V1 = Supabase Realtime BROADCAST con visibility-aware channel mode.
//   - Post public  → channel public (no setAuth richiesto)
//   - Post members/followers/private → channel private + setAuth(jwt
//     custom firmato con SUPABASE_JWT_SECRET via Server Action) + RLS
//     policy gate su realtime.messages.
//
// L'API esposta resta minimale (subscribe → unsubscribe). V2 può
// swap (single-channel pooling, Ably/Pusher) toccando SOLO questo file.
// Vedi sezione "Realtime authz" della architecture page.
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getBrowserSupabase } from "@/lib/supabase/browser-client";

export type CommentRealtimeEvent = {
  commentId: string;
  postId: string;
  parentCommentId: string | null;
  authorId: string;
  createdAt: string;
};

export type CommentsRealtimeSubscribeOpts = {
  postId: string;
  /** Se true il channel è public e bypassa setAuth. Se false il client
   *  deve passare un `jwtFetcher` che ritorna un JWT valido firmato
   *  con SUPABASE_JWT_SECRET (Server Action generateRealtimeAuthToken). */
  isPublic: boolean;
  /** Required quando isPublic=false. Ritorna il JWT (1 fetch al mount,
   *  re-fetch gestito dall'hook caller con TTL 50min). */
  jwtFetcher?: () => Promise<string | null>;
  onInsert: (event: CommentRealtimeEvent) => void;
  onError?: (err: Error) => void;
};

/**
 * Subscribe al broadcast del post. Ritorna una funzione di unsubscribe
 * sincrona (la subscribe vera è asincrona internamente — setAuth ha
 * latenza). L'unsubscribe è no-op se la subscribe non era ancora
 * iniziata o se il browser client non è disponibile.
 */
export function subscribeToCommentsForPost(
  opts: CommentsRealtimeSubscribeOpts,
): () => void {
  const supabase = getBrowserSupabase();
  if (!supabase) {
    return () => {};
  }

  let channel: RealtimeChannel | null = null;
  let unsubscribed = false;

  const start = async () => {
    try {
      // Channel private: setAuth con JWT custom PRIMA di subscribe.
      if (!opts.isPublic) {
        if (!opts.jwtFetcher) {
          return;
        }
        const jwt = await opts.jwtFetcher();
        if (unsubscribed) return;
        if (!jwt) {
          if (opts.onError) opts.onError(new Error("realtime_jwt_unavailable"));
          return;
        }
        await supabase.realtime.setAuth(jwt);
      }

      if (unsubscribed) return;

      channel = supabase
        .channel(`posts_comments:${opts.postId}`, {
          config: {
            broadcast: { self: false },
            private: !opts.isPublic,
          },
        })
        .on("broadcast", { event: "insert" }, (msg) => {
          if (unsubscribed) return;
          const p = (msg as { payload?: Record<string, unknown> }).payload;
          if (!p) return;
          const commentId = typeof p.commentId === "string" ? p.commentId : null;
          const postId = typeof p.postId === "string" ? p.postId : null;
          const authorId = typeof p.authorId === "string" ? p.authorId : null;
          const createdAt =
            typeof p.createdAt === "string" ? p.createdAt : null;
          const parentCommentId =
            typeof p.parentCommentId === "string" ? p.parentCommentId : null;
          if (!commentId || !postId || !authorId || !createdAt) return;
          opts.onInsert({
            commentId,
            postId,
            parentCommentId,
            authorId,
            createdAt,
          });
        })
        .subscribe((status, err) => {
          if (status === "CHANNEL_ERROR" && err && opts.onError) {
            opts.onError(err);
          }
        });
    } catch (err) {
      if (opts.onError) {
        opts.onError(err instanceof Error ? err : new Error(String(err)));
      }
    }
  };

  void start();

  return () => {
    unsubscribed = true;
    if (channel) {
      void supabase.removeChannel(channel);
    }
  };
}

export function isRealtimeAvailable(): boolean {
  return getBrowserSupabase() !== null;
}
