"use server";
// lib/modules/social-graph/list-actions.ts
//
// Server Action wrapper di `listFollowers` / `listFollowing` per il
// "Load more" client-side. Keyset paginated cursor = ISO createdAt.
// Le query sono block-aware: leggiamo il viewer dalla session e
// passiamo il suo id alle queries.ts come 4° parametro.

import { getUser } from "@/lib/db/queries";
import { listFollowers, listFollowing, type FollowListItem } from "./queries";

export type LoadMoreFollowListInput = {
  direction: "followers" | "following";
  userId: string;
  cursor: string | null;
};

export type LoadMoreFollowListResult =
  | {
      ok: true;
      data: { items: FollowListItem[]; nextCursor: string | null };
    }
  | { ok: false; error: string };

export async function loadMoreFollowList(
  input: LoadMoreFollowListInput,
): Promise<LoadMoreFollowListResult> {
  try {
    const viewer = await getUser();
    const viewerId = viewer?.id ?? null;
    const page =
      input.direction === "followers"
        ? await listFollowers(input.userId, input.cursor, undefined, viewerId)
        : await listFollowing(input.userId, input.cursor, undefined, viewerId);
    return { ok: true, data: page };
  } catch (err) {
    console.warn("[social-graph:list-actions] failed", {
      direction: input.direction,
      userId: input.userId,
      err: String(err),
    });
    return { ok: false, error: "socialGraph.errors.internal" };
  }
}
