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
  /**
   * Cursor encoded base64. `null` = prima pagina (utile dopo un tab
   * switch). Stringa non-vuota = pagina successiva al cursor.
   */
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
  if (input.tab !== "discover" && input.tab !== "following") {
    return { ok: false, error: "posts.feed.invalid_tab" };
  }

  const user = await getUser();
  const page = await getFeedIds({
    tab: input.tab,
    viewerUserId: user?.id,
    cursor: input.cursor ?? undefined,
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
