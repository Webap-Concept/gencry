"use server";
// lib/modules/posts/media-actions.ts
//
// Server Actions per la pipeline R2 di upload immagini ai post:
//
//   createPostMediaTicket  → valida mime/size + crea row posts_media
//                            draft (post_id NULL, confirmed_at NULL)
//                            + firma PUT presigned URL (TTL 120s).
//                            Client riceve { assetId, putUrl, key }.
//
//   confirmPostMediaUpload → HEAD R2 + processPostMedia (sharp full
//                            + thumb + EXIF strip + upload variants
//                            + delete originale) + setta confirmed_at.
//
//   deletePostMediaDraft   → l'utente cancella un'immagine prima del
//                            publish: DELETE row + DELETE R2 object.
//
// Le draft assignment al post avvengono dentro createPost (vedi
// actions.ts patch: accetta mediaIds[] e fa UPDATE posts_media SET
// post_id = NEW.id inside the same transaction).

import { eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/drizzle";
import { getUser } from "@/lib/db/queries";
import { getAppSettings } from "@/lib/db/settings-queries";
import { postsMedia } from "@/lib/db/schema";
import { checkPostRateLimit } from "./services/rate-limit";
import {
  processPostMedia,
  MediaProcessorMissingUploadError,
  MediaProcessorNotConfiguredError,
  MediaProcessorNotFoundError,
} from "./services/media-processor";
import {
  POST_MEDIA_ALLOWED_MIME,
  POST_MEDIA_MAX_BYTES,
  deletePostMediaObject,
  loadPostsR2Config,
  postMediaUploadKey,
  signPostMediaPut,
  type PostMediaMime,
} from "./storage";

type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string; retryAfter?: number };

const I18N = {
  unauthenticated:    "posts.errors.unauthenticated",
  banned:             "posts.errors.banned",
  rateLimited:        "posts.errors.rate_limited",
  notConfigured:      "posts.errors.r2_not_configured",
  invalidMime:        "posts.media.invalid_mime",
  invalidSize:        "posts.media.invalid_size",
  tooMany:            "posts.media.too_many_per_post",
  notFound:           "posts.media.not_found",
  uploadMissing:      "posts.media.upload_missing",
  processingFailed:   "posts.media.processing_failed",
  forbidden:          "posts.errors.forbidden",
} as const;

const TicketSchema = z.object({
  mime: z.enum(POST_MEDIA_ALLOWED_MIME),
  sizeBytes: z.number().int().positive().max(POST_MEDIA_MAX_BYTES),
});

export type CreatePostMediaTicketResult = ActionResult<{
  assetId: string;
  putUrl: string;
  storageKey: string;
}>;

export async function createPostMediaTicket(
  input: z.input<typeof TicketSchema>,
): Promise<CreatePostMediaTicketResult> {
  const user = await getUser();
  if (!user) return { ok: false, error: I18N.unauthenticated };
  if (user.bannedAt) return { ok: false, error: I18N.banned };

  const parsed = TicketSchema.safeParse(input);
  if (!parsed.success) {
    const code = parsed.error.issues[0].path[0];
    return { ok: false, error: code === "sizeBytes" ? I18N.invalidSize : I18N.invalidMime };
  }

  const rl = await checkPostRateLimit(user.id, "media");
  if (!rl.ok) return { ok: false, error: I18N.rateLimited, retryAfter: rl.retryAfter };

  const cfg = await loadPostsR2Config();
  if (!cfg) return { ok: false, error: I18N.notConfigured };

  // Limite "max 4 draft pending per utente" (allineato con la max
  // images_per_post). Evita che un utente generi ticket all'infinito
  // senza mai publicare → bloat orphan.
  const settings = await getAppSettings();
  const maxPerPost =
    parseInt(settings["modules.posts.max_images_per_post"], 10) || 4;
  const pendingCount = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(postsMedia)
    .where(
      sql`${postsMedia.authorId} = ${user.id} AND ${postsMedia.postId} IS NULL AND ${postsMedia.confirmedAt} IS NULL`,
    );
  if ((pendingCount[0]?.count ?? 0) >= maxPerPost) {
    return { ok: false, error: I18N.tooMany };
  }

  // INSERT draft + firma URL. La storageKey definitiva la calcoliamo
  // DOPO l'INSERT (ci serve l'id v7 per il path).
  const placeholderKey = "pending"; // verrà aggiornata subito sotto
  const [inserted] = await db
    .insert(postsMedia)
    .values({
      authorId: user.id,
      storageKey: placeholderKey + "/" + crypto.randomUUID(),
      mimeType: parsed.data.mime,
      sizeBytes: parsed.data.sizeBytes,
      position: 0,
    })
    .returning({ id: postsMedia.id });

  const storageKey = postMediaUploadKey(user.id, inserted.id, parsed.data.mime as PostMediaMime);
  await db
    .update(postsMedia)
    .set({ storageKey })
    .where(eq(postsMedia.id, inserted.id));

  const putUrl = await signPostMediaPut({
    cfg,
    key: storageKey,
    contentType: parsed.data.mime as PostMediaMime,
    contentLength: parsed.data.sizeBytes,
  });

  return { ok: true, data: { assetId: inserted.id, putUrl, storageKey } };
}

const ConfirmSchema = z.object({
  assetId: z.string().uuid(),
});

export type ConfirmPostMediaUploadResult = ActionResult<{
  assetId: string;
  fullUrl: string;
  thumbUrl: string;
  width: number;
  height: number;
}>;

export async function confirmPostMediaUpload(
  input: z.input<typeof ConfirmSchema>,
): Promise<ConfirmPostMediaUploadResult> {
  const user = await getUser();
  if (!user) return { ok: false, error: I18N.unauthenticated };

  const parsed = ConfirmSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: I18N.notFound };

  // Ownership check
  const [asset] = await db
    .select({ id: postsMedia.id, authorId: postsMedia.authorId })
    .from(postsMedia)
    .where(eq(postsMedia.id, parsed.data.assetId))
    .limit(1);
  if (!asset) return { ok: false, error: I18N.notFound };
  if (asset.authorId !== user.id) return { ok: false, error: I18N.forbidden };

  try {
    const res = await processPostMedia(parsed.data.assetId);
    return {
      ok: true,
      data: { assetId: parsed.data.assetId, ...res },
    };
  } catch (err) {
    if (err instanceof MediaProcessorNotConfiguredError) {
      return { ok: false, error: I18N.notConfigured };
    }
    if (err instanceof MediaProcessorNotFoundError) {
      return { ok: false, error: I18N.notFound };
    }
    if (err instanceof MediaProcessorMissingUploadError) {
      return { ok: false, error: I18N.uploadMissing };
    }
    console.error("[posts/media] processing failed:", err);
    return { ok: false, error: I18N.processingFailed };
  }
}

const DeleteDraftSchema = z.object({
  assetId: z.string().uuid(),
});

export async function deletePostMediaDraft(
  input: z.input<typeof DeleteDraftSchema>,
): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return { ok: false, error: I18N.unauthenticated };

  const parsed = DeleteDraftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: I18N.notFound };

  // Carica per check ownership + per ottenere storage_key da cancellare.
  // Solo i draft (post_id NULL) sono deletable da qui — un media già
  // attaccato a un post si cancella via softDeletePost del post stesso.
  const [asset] = await db
    .select({
      id: postsMedia.id,
      authorId: postsMedia.authorId,
      storageKey: postsMedia.storageKey,
      postId: postsMedia.postId,
    })
    .from(postsMedia)
    .where(eq(postsMedia.id, parsed.data.assetId))
    .limit(1);

  if (!asset) return { ok: false, error: I18N.notFound };
  if (asset.authorId !== user.id) return { ok: false, error: I18N.forbidden };
  if (asset.postId) return { ok: false, error: I18N.forbidden };

  const cfg = await loadPostsR2Config();
  if (cfg) await deletePostMediaObject(cfg, asset.storageKey);
  await db
    .delete(postsMedia)
    .where(
      sql`${postsMedia.id} = ${parsed.data.assetId} AND ${postsMedia.postId} IS NULL`,
    );

  return { ok: true };
}

