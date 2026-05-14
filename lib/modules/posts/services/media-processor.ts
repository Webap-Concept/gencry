// lib/modules/posts/services/media-processor.ts
//
// Impl reale: scarica l'originale da R2, genera 2 varianti webp con
// sharp (full 2048px lato lungo q80, thumb 400px q70), upload su R2,
// cancella l'originale, aggiorna la row posts_media con i 2 URL.
//
// Sharp `.rotate()` SENZA argomenti applica EXIF orientation alla
// matrice di pixel e poi rimuove i tag EXIF dall'output — la privacy
// nota GPS sparisce by-default. webp() inoltre non riemette EXIF.
//
// Hookable: questa è l'impl V1. V2 (quando volumi giustificano)
// sostituirà con Cloudflare Worker + R2 Queue + photon-wasm; la
// signature di `processPostMedia(assetId)` resta identica → niente
// modifiche al chiamante (Server Action confirmPostMediaUpload).
import "server-only";

import sharp from "sharp";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { postsMedia } from "@/lib/db/schema";
import {
  deletePostMediaObject,
  getPostMediaObjectBuffer,
  getPostMediaPublicUrl,
  headPostMedia,
  loadPostsR2Config,
  postMediaVariantKeys,
  putPostMediaObject,
} from "../storage";

const FULL_MAX_SIDE  = 2048;
const FULL_QUALITY   = 80;
const THUMB_MAX_SIDE = 400;
const THUMB_QUALITY  = 70;

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

  // Scarica originale, processa.
  const raw = await getPostMediaObjectBuffer(cfg, asset.storageKey);
  const pipeline = sharp(raw, { failOn: "error" }).rotate(); // EXIF strip + orientation

  // Leggo i metadata della full per popolare width/height nel DB.
  const fullBuf = await pipeline
    .clone()
    .resize({ width: FULL_MAX_SIDE, height: FULL_MAX_SIDE, fit: "inside", withoutEnlargement: true })
    .webp({ quality: FULL_QUALITY })
    .toBuffer({ resolveWithObject: true });

  const thumbBuf = await pipeline
    .clone()
    .resize({ width: THUMB_MAX_SIDE, height: THUMB_MAX_SIDE, fit: "inside", withoutEnlargement: true })
    .webp({ quality: THUMB_QUALITY })
    .toBuffer();

  const { full: fullKey, thumb: thumbKey } = postMediaVariantKeys(asset.storageKey);

  await Promise.all([
    putPostMediaObject({ cfg, key: fullKey,  body: fullBuf.data,  contentType: "image/webp" }),
    putPostMediaObject({ cfg, key: thumbKey, body: thumbBuf,      contentType: "image/webp" }),
  ]);

  // L'originale non serve più — risparmiamo storage e bandwidth nel cleanup.
  await deletePostMediaObject(cfg, asset.storageKey);

  const fullUrl  = getPostMediaPublicUrl(cfg, fullKey);
  const thumbUrl = getPostMediaPublicUrl(cfg, thumbKey);
  const width    = fullBuf.info.width  ?? null;
  const height   = fullBuf.info.height ?? null;

  await db
    .update(postsMedia)
    .set({
      storageKey: fullKey,  // aggiornata perché ora rappresenta il full webp
      fullUrl,
      thumbUrl,
      width,
      height,
      mimeType: "image/webp",
      sizeBytes: fullBuf.data.byteLength,
      confirmedAt: new Date(),
    })
    .where(eq(postsMedia.id, assetId));

  return {
    fullUrl,
    thumbUrl,
    width:  width  ?? 0,
    height: height ?? 0,
  };
}

// Backwards-compat: il modulo precedente esportava anche
// MediaProcessorNotImplementedError. Lo manteniamo come alias del
// "not configured" così codice di chiamata del periodo stub continua
// a compilare; verrà rimosso quando i caller saranno migrati.
export class MediaProcessorNotImplementedError extends MediaProcessorNotConfiguredError {}
