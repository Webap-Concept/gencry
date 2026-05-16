"use server";
// lib/modules/posts/feed-actions.ts
//
// Server Action wrapper sopra `getFeedIds` + `getPostsByIds` per la
// pagination client-side ("Load more"). Tenuto in un file separato da
// actions.ts perché:
//   - quel file espone mutation che il client invoca via startTransition;
//     questo invece è "fetch via Server Action" — concettualmente diverso
//     anche se condivide la pragma "use server".
//   - più snello da auditare per cosa è chiamabile dal client.

import { getUser } from "@/lib/db/queries";
import {
  getFeedIds,
  getPostsByIds,
  getTickerFeedIds,
} from "./queries";
import type { FeedTab } from "./queries";
import type { PostCardData } from "./types";

/**
 * Tipo discriminato per i diversi feed paginabili da Explore/Home.
 * "discover"/"following" → getFeedIds. "ticker" → getTickerFeedIds.
 */
export type LoadMoreFeedInput =
  | {
      kind: "tab";
      tab: FeedTab;
      cursor: string | null;
    }
  | {
      kind: "ticker";
      ticker: string;
      cursor: string | null;
    };

export type LoadMoreFeedResult =
  | {
      ok: true;
      data: {
        posts: PostCardData[];
        nextCursor: string | null;
      };
    }
  | { ok: false; error: string };

export async function loadMoreFeed(
  input: LoadMoreFeedInput,
): Promise<LoadMoreFeedResult> {
  const user = await getUser();

  if (input.kind === "tab") {
    if (input.tab !== "discover" && input.tab !== "following") {
      return { ok: false, error: "posts.feed.invalid_tab" };
    }
    const page = await getFeedIds({
      tab: input.tab,
      viewerUserId: user?.id,
      cursor: input.cursor ?? undefined,
    });
    const posts = await getPostsByIds(page.ids, { viewerUserId: user?.id });
    return {
      ok: true,
      data: { posts, nextCursor: page.nextCursor },
    };
  }

  // kind === "ticker"
  const tickerNorm = input.ticker.toUpperCase();
  if (!/^[A-Z][A-Z0-9]{1,19}$/.test(tickerNorm)) {
    return { ok: false, error: "posts.feed.invalid_ticker" };
  }
  const page = await getTickerFeedIds({
    ticker: tickerNorm,
    viewerUserId: user?.id,
    cursor: input.cursor ?? undefined,
  });
  const posts = await getPostsByIds(page.ids, { viewerUserId: user?.id });
  return {
    ok: true,
    data: { posts, nextCursor: page.nextCursor },
  };
}
