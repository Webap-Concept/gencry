"use server";
// lib/modules/posts/preferences-actions.ts
//
// Server Actions per posts_user_preferences (sidecar 1:1 con users).
//
// `default_visibility`: l'ultima visibility scelta dall'utente nel Composer
// diventa il default per i post successivi (sticky cross-device). Riga
// creata lazy on first set; assenza riga = default app "public".
//
// RBAC: ogni action chiama getUser() e scrive SOLO sull'user corrente.
// Niente parametro userId nel write: impossibile cross-user write by design.

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/drizzle";
import { getUser } from "@/lib/db/queries";
import {
  POST_VISIBILITIES,
  postsUserPreferences,
  type PostVisibility,
} from "@/lib/db/schema";

export type PostsPreferencesActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

const DEFAULT_VISIBILITY: PostVisibility = "public";

export type PostsUserPreferencesView = {
  defaultVisibility: PostVisibility;
};

function isPostVisibility(v: unknown): v is PostVisibility {
  return typeof v === "string" && (POST_VISIBILITIES as readonly string[]).includes(v);
}

/** Read-only. Per chiamate non-server-component, lato server. */
export async function getMyPostPreferences(): Promise<
  PostsPreferencesActionResult<PostsUserPreferencesView>
> {
  const user = await getUser();
  if (!user) return { ok: false, error: "posts.errors.unauthenticated" };

  const row = await db
    .select({ defaultVisibility: postsUserPreferences.defaultVisibility })
    .from(postsUserPreferences)
    .where(eq(postsUserPreferences.userId, user.id))
    .limit(1)
    .then((r) => r[0]);

  const dv = isPostVisibility(row?.defaultVisibility)
    ? (row!.defaultVisibility as PostVisibility)
    : DEFAULT_VISIBILITY;

  return { ok: true, data: { defaultVisibility: dv } };
}

/** Upsert lazy: crea la riga al primo set, aggiorna updated_at on conflict. */
export async function setMyDefaultPostVisibility(
  v: PostVisibility,
): Promise<PostsPreferencesActionResult> {
  const user = await getUser();
  if (!user) return { ok: false, error: "posts.errors.unauthenticated" };

  if (!isPostVisibility(v)) {
    return { ok: false, error: "posts.errors.invalid_visibility" };
  }

  await db
    .insert(postsUserPreferences)
    .values({ userId: user.id, defaultVisibility: v })
    .onConflictDoUpdate({
      target: postsUserPreferences.userId,
      set: { defaultVisibility: v, updatedAt: sql`NOW()` },
    });

  revalidatePath("/settings/privacy");
  return { ok: true };
}
