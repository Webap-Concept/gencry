// lib/modules/posts/post-page-data.ts
//
// Orchestratore "single source of data" per la vista singolo post.
// Usato sia dalla page standalone `/post/[id]` sia dalla modale
// intercepting `@modal/(.)post/[id]` — entrambe renderizzano lo stesso
// PostCard variant="single" + CommentsThread, quindi devono caricare
// gli stessi dati per evitare drift.
//
// Niente import da queries.ts pesanti: gli SELECT raw vivono lì,
// qui solo l'orchestrazione (Promise.all + branching).

import "server-only";

import {
  getInitialRepliesForRoots,
  getPostBySlug,
  getRootCommentsForPost,
} from "@/lib/modules/posts/queries";
import { loadCommentsConfig } from "@/lib/modules/posts/comments-config";
import { collectVisibleTickers } from "@/lib/modules/posts/lib/collect-visible-tickers";
import { getTickerPreviewBatch } from "@/lib/modules/posts/ticker-preview-actions";
import { getCoinNameMap } from "@/lib/modules/prices/queries";
import type { PostCardData } from "@/lib/modules/posts/types";

export type PostPageData = {
  post: PostCardData;
  coinNameMap: Awaited<ReturnType<typeof getCoinNameMap>>;
  commentsConfig: Awaited<ReturnType<typeof loadCommentsConfig>>;
  tickerPreviewMap: Awaited<ReturnType<typeof getTickerPreviewBatch>>;
  rootPage: Awaited<ReturnType<typeof getRootCommentsForPost>>;
  initialReplies: Awaited<ReturnType<typeof getInitialRepliesForRoots>>;
};

/**
 * Carica tutti i dati necessari per renderizzare un post in vista
 * singola (page standalone + modale intercepting). Ritorna null se
 * il post non esiste, è soft-deleted, o il viewer non ha accesso
 * (visibility filter già applicato da getPostBySlug).
 *
 * Il caller decide cosa fare con `null` (page → notFound/redirect,
 * modale → chiudere + toast).
 */
export async function getPostPageData(
  id: string,
  viewerUserId?: string,
): Promise<PostPageData | null> {
  const [post, coinNameMap, commentsConfig] = await Promise.all([
    getPostBySlug(id, { viewerUserId }),
    getCoinNameMap(),
    loadCommentsConfig(),
  ]);
  if (!post) return null;

  // Secondo round: dipende da `post` (tickerPreviewMap) o da `commentsConfig`
  // (repliesInitialCount). Parallelo dove possibile.
  const [tickerPreviewMap, rootPage] = await Promise.all([
    getTickerPreviewBatch(collectVisibleTickers([post])),
    getRootCommentsForPost({ postId: post.id, viewerUserId }),
  ]);

  const initialReplies =
    rootPage.comments.length === 0
      ? {}
      : await getInitialRepliesForRoots({
          rootIds: rootPage.comments.map((c) => c.id),
          perRoot: commentsConfig.repliesInitialCount,
          viewerUserId,
        });

  return {
    post,
    coinNameMap,
    commentsConfig,
    tickerPreviewMap,
    rootPage,
    initialReplies,
  };
}
