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
 *
 * `pageSize` opzionale: il client invia 30 dalle pagine 2+ (utente
 * engaged → meno round-trip), la first page resta 20 (SSR, time-to-first
 * paint priority). Server-side cap 50 difensivo: niente requests
 * arbitrariamente grosse da client-tampering.
 */
export type LoadMoreFeedInput =
  | {
      kind: "tab";
      tab: FeedTab;
      cursor: string | null;
      pageSize?: number;
    }
  | {
      kind: "ticker";
      ticker: string;
      cursor: string | null;
      pageSize?: number;
    };

const MAX_PAGE_SIZE = 50;

function clampPageSize(raw: number | undefined): number | undefined {
  if (raw === undefined) return undefined;
  if (!Number.isFinite(raw) || raw < 1) return undefined;
  return Math.min(Math.floor(raw), MAX_PAGE_SIZE);
}

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

  const pageSize = clampPageSize(input.pageSize);

  if (input.kind === "tab") {
    if (input.tab !== "discover" && input.tab !== "following") {
      return { ok: false, error: "posts.feed.invalid_tab" };
    }
    const page = await getFeedIds({
      tab: input.tab,
      viewerUserId: user?.id,
      cursor: input.cursor ?? undefined,
      pageSize,
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
    pageSize,
  });
  const posts = await getPostsByIds(page.ids, { viewerUserId: user?.id });
  return {
    ok: true,
    data: { posts, nextCursor: page.nextCursor },
  };
}
