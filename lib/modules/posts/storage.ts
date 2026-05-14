// lib/modules/posts/storage.ts
//
// Storage layer del modulo posts su Cloudflare R2 (bucket dedicato
// `social-media`, settings `modules.posts.r2.*`). Stesso pattern di
// lib/storage/r2-avatars.ts con scope di modulo + isolamento token.
//
// Public surface:
//   loadPostsR2Config()       legge & valida le 5 settings R2
//   createPostsR2Client()     factory S3 client (AWS SDK v3)
//   signPostMediaPut()        firma presigned PUT URL (TTL 120s)
//   headPostMedia()           verifica che l'oggetto sia stato uploadato
//   getPostMediaObject()      scarica l'oggetto come Buffer (per sharp)
//   putPostMediaObject()      upload diretto server-side (per varianti)
//   deletePostMediaObject()   cleanup orphan / soft-delete
//   getPostMediaPublicUrl()   compone l'URL pubblico
//   checkPostsR2Connection()  HeadBucket per "Test connection" admin
//
// Tutti gli error-path ritornano Discriminated Union (no throw on
// configurazione mancante) — il caller decide se trattare come fatal
// o degradare a "feature disabled".
import "server-only";

import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Readable } from "node:stream";
import { getAppSettings } from "@/lib/db/settings-queries";

export interface PostsR2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl: string; // senza trailing slash
}

/**
 * Normalizza un public base URL admin-inserito. Aggiunge `https://`
 * se manca lo schema così l'utente può scrivere "media.example.com"
 * tanto quanto "https://media.example.com" senza rompere l'output di
 * getPostMediaPublicUrl. Strip dei trailing slashes per uniformità.
 *
 * Esportata perché la save action la riusa per persistire una
 * versione canonica in DB (vedi savePostsR2Settings).
 */
export function normalizePublicBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export async function loadPostsR2Config(): Promise<PostsR2Config | null> {
  const s = await getAppSettings();
  // accountId è TENANT-GLOBAL (vedi project_modular_architecture
  // §"Per-modulo vs globale"). Letto da `storage.r2.account_id`,
  // condiviso con il bucket avatars del core e con il modulo prices.
  const accountId       = (s["storage.r2.account_id"]              ?? "").trim();
  const accessKeyId     = (s["modules.posts.r2.access_key_id"]     ?? "").trim();
  const secretAccessKey = (s["modules.posts.r2.secret_access_key"] ?? "").trim();
  const bucket          = (s["modules.posts.r2.bucket"]            ?? "").trim();
  const publicBaseUrl   = normalizePublicBaseUrl(s["modules.posts.r2.public_base_url"] ?? "");
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBaseUrl) {
    return null;
  }
  return { accountId, accessKeyId, secretAccessKey, bucket, publicBaseUrl };
}

export function createPostsR2Client(cfg: PostsR2Config): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  });
}

export const POST_MEDIA_ALLOWED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
export type PostMediaMime = (typeof POST_MEDIA_ALLOWED_MIME)[number];
export const POST_MEDIA_MAX_BYTES = 8 * 1024 * 1024; // 8 MB pre-processing

function extFromMime(mime: PostMediaMime): "jpg" | "png" | "webp" {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

/**
 * Storage key per il file originale uploadato dal client.
 * Path: `users/{userId}/uploads/{uuid}.{ext}`. Dopo il processing
 * sharp ne creiamo 2 varianti accanto: `_full.webp` e `_thumb.webp`,
 * e l'originale viene cancellato (vedi media-processor).
 */
export function postMediaUploadKey(
  userId: string,
  assetId: string,
  mime: PostMediaMime,
): string {
  return `users/${userId}/uploads/${assetId}.${extFromMime(mime)}`;
}

export function postMediaVariantKeys(uploadKey: string): {
  full: string;
  thumb: string;
} {
  const base = uploadKey.replace(/\.[^.]+$/, "");
  return {
    full:  `${base}_full.webp`,
    thumb: `${base}_thumb.webp`,
  };
}

export function getPostMediaPublicUrl(cfg: PostsR2Config, key: string): string {
  return `${cfg.publicBaseUrl}/${key}`;
}

/**
 * Firma un PUT presigned URL valido 120 secondi. Il client farà PUT
 * diretto a R2 con Content-Type forced (deve corrispondere a quello
 * usato nella firma) per evitare upload con MIME diverso da quello
 * dichiarato in fase di ticket.
 */
export async function signPostMediaPut(args: {
  cfg: PostsR2Config;
  key: string;
  contentType: PostMediaMime;
  contentLength: number;
}): Promise<string> {
  const client = createPostsR2Client(args.cfg);
  const cmd = new PutObjectCommand({
    Bucket: args.cfg.bucket,
    Key: args.key,
    ContentType: args.contentType,
    ContentLength: args.contentLength,
  });
  return getSignedUrl(client, cmd, { expiresIn: 120 });
}

/**
 * Verifica che l'oggetto sia effettivamente stato uploadato (chiamata
 * leggera HEAD). Ritorna anche la size reale per double-check
 * contro la size dichiarata in fase di ticket.
 */
export async function headPostMedia(
  cfg: PostsR2Config,
  key: string,
): Promise<{ exists: false } | { exists: true; sizeBytes: number; contentType: string | undefined }> {
  try {
    const client = createPostsR2Client(cfg);
    const res = await client.send(
      new HeadObjectCommand({ Bucket: cfg.bucket, Key: key }),
    );
    return {
      exists: true,
      sizeBytes: res.ContentLength ?? 0,
      contentType: res.ContentType,
    };
  } catch (err) {
    const status =
      typeof err === "object" && err !== null && "$metadata" in err
        ? (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
        : undefined;
    if (status === 404 || status === 403) return { exists: false };
    throw err;
  }
}

export async function getPostMediaObjectBuffer(
  cfg: PostsR2Config,
  key: string,
): Promise<Buffer> {
  const client = createPostsR2Client(cfg);
  const res = await client.send(
    new GetObjectCommand({ Bucket: cfg.bucket, Key: key }),
  );
  const stream = res.Body as Readable;
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function putPostMediaObject(args: {
  cfg: PostsR2Config;
  key: string;
  body: Buffer;
  contentType: string;
}): Promise<void> {
  const client = createPostsR2Client(args.cfg);
  await client.send(
    new PutObjectCommand({
      Bucket: args.cfg.bucket,
      Key: args.key,
      Body: args.body,
      ContentType: args.contentType,
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
}

export async function deletePostMediaObject(
  cfg: PostsR2Config,
  key: string,
): Promise<void> {
  try {
    const client = createPostsR2Client(cfg);
    await client.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }));
  } catch (err) {
    // Best-effort: log ma non rilanciare. L'orphan resta cleanable
    // dal cron daily.
    console.error("[posts/storage] R2 DELETE failed:", err);
  }
}

export type PostsR2ConnectionResult =
  | { ok: true }
  | {
      ok: false;
      reason: "missing_config" | "forbidden" | "not_found" | "network" | "timeout" | "unknown";
      detail?: string;
    };

export async function checkPostsR2Connection(
  cfg: PostsR2Config,
): Promise<PostsR2ConnectionResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const client = createPostsR2Client(cfg);
    await client.send(new HeadBucketCommand({ Bucket: cfg.bucket }), {
      abortSignal: controller.signal,
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, reason: "timeout" };
    }
    const status =
      typeof err === "object" && err !== null && "$metadata" in err
        ? (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
        : undefined;
    if (status === 401 || status === 403) return { ok: false, reason: "forbidden" };
    if (status === 404) return { ok: false, reason: "not_found" };
    const message = err instanceof Error ? err.message : String(err);
    if (/network|fetch failed|ECONNREFUSED|ENOTFOUND|getaddrinfo/i.test(message)) {
      return { ok: false, reason: "network", detail: message };
    }
    return { ok: false, reason: "unknown", detail: message };
  } finally {
    clearTimeout(timeout);
  }
}
