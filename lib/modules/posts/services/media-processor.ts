// lib/modules/posts/services/media-processor.ts
//
// Impl reale: scarica l'originale da R2, genera 2 varianti webp via
// la pipeline pura `lib/storage/image-pipeline.ts` (full 2048px q80,
// thumb 400px q70), upload su R2, cancella l'originale, aggiorna la
// row posts_media con i 2 URL.
//
// EXIF strip + privacy GPS sono gestiti dalla pipeline (vedi
// image-pipeline.ts per i dettagli).
//
// Hookable: questa è l'impl V1. V2 (quando volumi giustificano)
// sostituirà con Cloudflare Worker + R2 Queue + photon-wasm; la
// signature di `processPostMedia(assetId)` resta identica → niente
// modifiche al chiamante (Server Action confirmPostMediaUpload).
import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { postsMedia } from "@/lib/db/schema";
import { processImageToWebpVariants } from "@/lib/storage/image-pipeline";
import {
  deletePostMediaObject,
  getPostMediaObjectBuffer,
  getPostMediaPublicUrl,
  headPostMedia,
  loadPostsR2Config,
  postMediaVariantKeys,
  putPostMediaObject,
} from "../storage";

const POSTS_VARIANTS = [
  { name: "full",  maxSide: 2048, quality: 80 },
  { name: "thumb", maxSide: 400,  quality: 70 },
] as const;

export type ProcessPostMediaResult = {
  fullUrl: string;
  thumbUrl: string;
  width: number;
  height: number;
};

export class MediaProcessorNotConfiguredError extends Error {
  constructor() {
    super("posts.media.r2_not_configured");
    this.name = "MediaProcessorNotConfiguredError";
  }
}
export class MediaProcessorNotFoundError extends Error {
  constructor() {
    super("posts.media.not_found");
    this.name = "MediaProcessorNotFoundError";
  }
}
export class MediaProcessorMissingUploadError extends Error {
  constructor() {
    super("posts.media.upload_missing");
    this.name = "MediaProcessorMissingUploadError";
  }
}

/**
 * Processa l'asset uploadato (originale su R2 al `storage_key` salvato
 * nel ticket draft) e popola fullUrl/thumbUrl/width/height/confirmed_at.
 *
 * Idempotente: se l'asset ha già confirmed_at non-null, ritorna i suoi
 * URL senza ri-processare (utile in caso di retry del client).
 */
export async function processPostMedia(
  assetId: string,
): Promise<ProcessPostMediaResult> {
  const cfg = await loadPostsR2Config();
  if (!cfg) throw new MediaProcessorNotConfiguredError();

  const [asset] = await db
    .select({
      id: postsMedia.id,
      storageKey: postsMedia.storageKey,
      fullUrl: postsMedia.fullUrl,
      thumbUrl: postsMedia.thumbUrl,
      width: postsMedia.width,
      height: postsMedia.height,
      confirmedAt: postsMedia.confirmedAt,
    })
    .from(postsMedia)
    .where(eq(postsMedia.id, assetId))
    .limit(1);

  if (!asset) throw new MediaProcessorNotFoundError();

  // Idempotency: già processato
  if (asset.confirmedAt && asset.fullUrl && asset.thumbUrl && asset.width && asset.height) {
    return {
      fullUrl: asset.fullUrl,
      thumbUrl: asset.thumbUrl,
      width: asset.width,
      height: asset.height,
    };
  }

  // Verifica che il client abbia effettivamente fatto PUT su R2.
  const head = await headPostMedia(cfg, asset.storageKey);
  if (!head.exists) throw new MediaProcessorMissingUploadError();

  // Scarica originale, processa via pipeline condivisa.
  const raw = await getPostMediaObjectBuffer(cfg, asset.storageKey);
  const variants = await processImageToWebpVariants(raw, POSTS_VARIANTS);
  const full  = variants.find((v) => v.name === "full")!;
  const thumb = variants.find((v) => v.name === "thumb")!;

  const { full: fullKey, thumb: thumbKey } = postMediaVariantKeys(asset.storageKey);

  await Promise.all([
    putPostMediaObject({ cfg, key: fullKey,  body: full.buffer,  contentType: "image/webp" }),
    putPostMediaObject({ cfg, key: thumbKey, body: thumb.buffer, contentType: "image/webp" }),
  ]);

  // L'originale non serve più — risparmiamo storage e bandwidth nel cleanup.
  await deletePostMediaObject(cfg, asset.storageKey);

  const fullUrl  = getPostMediaPublicUrl(cfg, fullKey);
  const thumbUrl = getPostMediaPublicUrl(cfg, thumbKey);

  await db
    .update(postsMedia)
    .set({
      storageKey: fullKey,  // aggiornata perché ora rappresenta il full webp
      fullUrl,
      thumbUrl,
      width:  full.width,
      height: full.height,
      mimeType: "image/webp",
      sizeBytes: full.sizeBytes,
      confirmedAt: new Date(),
    })
    .where(eq(postsMedia.id, assetId));

  return {
    fullUrl,
    thumbUrl,
    width:  full.width,
    height: full.height,
  };
}

// Backwards-compat: il modulo precedente esportava anche
// MediaProcessorNotImplementedError. Lo manteniamo come alias del
// "not configured" così codice di chiamata del periodo stub continua
// a compilare; verrà rimosso quando i caller saranno migrati.
export class MediaProcessorNotImplementedError extends MediaProcessorNotConfiguredError {}
