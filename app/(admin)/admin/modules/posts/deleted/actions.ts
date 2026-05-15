"use server";
// app/(admin)/admin/modules/posts/deleted/actions.ts
//
// Server Action admin-only per ripristinare un post soft-deleted ancora
// in grace period. Gate RBAC `modules:posts.moderate`.
//
// Grace: `modules.posts.deleted_grace_days` (default 7). Oltre, il cron
// hard-delete-deleted rimuove la riga fisicamente: nessun restore
// possibile (CASCADE FK ha già cancellato media/reactions/comments).

import { and, eq, isNotNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/drizzle";
import { posts } from "@/lib/db/schema";
import { getAppSettings } from "@/lib/db/settings-queries";
import { requireAdminSectionPage } from "@/lib/rbac/guards";
import { invalidateFeedCache } from "@/lib/modules/posts/services/feed-cache";
import { invalidatePostCache } from "@/lib/modules/posts/services/post-cache";
import { z } from "zod";

const RestoreSchema = z.object({
  postId: z.string().uuid(),
});

export type RestorePostResult =
  | { ok: true; postId: string }
  | { ok: false; error: string };

/**
 * Ripristina un post soft-deleted clearing `posts.deleted_at`.
 *
 * Vincoli:
 *  - Solo post con `deleted_at IS NOT NULL`
 *  - Solo entro la grace window (deleted_at > now() - grace_days)
 *
 * Se il post è oltre grace ma ancora in DB (cron non ancora passato),
 * blocchiamo comunque: UX coerente con "dopo 7gg è definitivo" promesso
 * all'utente nel delete confirm dialog.
 */
export async function restorePostAction(
  input: z.input<typeof RestoreSchema>,
): Promise<RestorePostResult> {
  await requireAdminSectionPage("modules:posts.moderate");

  const parsed = RestoreSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const settings = await getAppSettings();
  const graceDays =
    parseInt(settings["modules.posts.deleted_grace_days"], 10) || 7;
  const cutoff = new Date(Date.now() - graceDays * 24 * 60 * 60 * 1000);

  const result = await db
    .update(posts)
    .set({ deletedAt: null })
    .where(
      and(
        eq(posts.id, parsed.data.postId),
        isNotNull(posts.deletedAt),
        sql`${posts.deletedAt} >= ${cutoff}`,
      ),
    )
    .returning({ id: posts.id, authorId: posts.authorId });

  if (result.length === 0) {
    return { ok: false, error: "post_not_in_grace" };
  }

  await invalidatePostCache(parsed.data.postId);
  await invalidateFeedCache("discover");
  await invalidateFeedCache({ profile: result[0].authorId });
  await invalidateFeedCache({ followersOf: result[0].authorId });

  // Invalida Router Cache: feed/profile/post pages devono mostrare di
  // nuovo il post ripristinato al next visit.
  revalidatePath("/", "layout");
  revalidatePath("/admin/modules/posts/deleted");

  return { ok: true, postId: result[0].id };
}
