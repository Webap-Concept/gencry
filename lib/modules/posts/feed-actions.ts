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
import { getFeedIds, getPostsByIds } from "./queries";
import type { FeedTab } from "./queries";
import type { PostCardData } from "./types";

export type LoadMoreFeedInput = {
  tab: FeedTab;
  cursor: string;
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

/**
 * Carica la pagina successiva del feed. Il `cursor` arriva dal client
 * (encoded base64). Visibility/auth applicati lato server come per la
 * first page.
 */
export async function loadMoreFeed(
  input: LoadMoreFeedInput,
): Promise<LoadMoreFeedResult> {
  if (input.tab !== "discover" && input.tab !== "following") {
    return { ok: false, error: "posts.feed.invalid_tab" };
  }
  if (!input.cursor || typeof input.cursor !== "string") {
    return { ok: false, error: "posts.feed.missing_cursor" };
  }

  const user = await getUser();
  const page = await getFeedIds({
    tab: input.tab,
    viewerUserId: user?.id,
    cursor: input.cursor,
  });
  const posts = await getPostsByIds(page.ids, { viewerUserId: user?.id });

  return {
    ok: true,
    data: {
      posts,
      nextCursor: page.nextCursor,
    },
  };
}
