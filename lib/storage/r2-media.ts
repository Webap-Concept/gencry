// lib/storage/r2-media.ts
//
// Storage media library del CMS core su Cloudflare R2.
//
// Architettura coerente con r2-avatars.ts / config snapshot R2:
//   - accountId GLOBALE in `storage.r2.account_id`
//   - access_key / secret / bucket / public_base_url in `storage.media.r2.*`
//     (token isolato per-bucket, security)
//   - egress R2 = 0 → ottimo per asset CMS pubblici / SEO
//
// Flow upload:
//   client → server (createMediaUploadTicket) → presigned PUT URL R2
//          → client PUT diretto al bucket via XHR (progress)
//          → client → server (confirmMediaUpload) → HeadObject + sanitize SVG
//
// SVG: sanitize server-side (download → sanitize-html → re-upload) prima
// del confirm. Stesso pattern del vecchio flow Supabase.
import "server-only";

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getAppSettings } from "@/lib/db/settings-queries";
import type { MediaMime } from "./media-constants";

// ──────────────────────────────────────────────────────────────────────────
// Config loader
// ──────────────────────────────────────────────────────────────────────────

export interface MediaR2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl: string; // senza trailing slash
}

/**
 * Ritorna la config R2 media o null se una delle 5 chiavi è vuota. Il caller
 * NON deve fallbackare a Supabase: ritorna un errore esplicito al chiamante
 * (vedi r2-avatars per il razionale — niente dual-backend).
 */
export async function loadMediaR2Config(): Promise<MediaR2Config | null> {
  const s = await getAppSettings();
  const accountId       = (s["storage.r2.account_id"]              ?? "").trim();
  const accessKeyId     = (s["storage.media.r2.access_key_id"]     ?? "").trim();
  const secretAccessKey = (s["storage.media.r2.secret_access_key"] ?? "").trim();
  const bucket          = (s["storage.media.r2.bucket"]            ?? "").trim();
  const publicBaseUrl   = (s["storage.media.r2.public_base_url"]   ?? "").trim().replace(/\/+$/, "");
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBaseUrl) {
    return null;
  }
  return { accountId, accessKeyId, secretAccessKey, bucket, publicBaseUrl };
}

export function createMediaR2Client(cfg: MediaR2Config): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  });
}

// ──────────────────────────────────────────────────────────────────────────
// Public URL helper
// ──────────────────────────────────────────────────────────────────────────

/**
 * Deterministic public URL per una key. Il bucket dev'essere esposto via
 * custom domain (es. https://storage.<dominio>) — `publicBaseUrl` è quello.
 * Non includiamo cache-bust: le key sono UUID, mai sovrascritte.
 */
export function buildMediaPublicUrl(cfg: MediaR2Config, key: string): string {
  return `${cfg.publicBaseUrl}/${key}`;
}

// ──────────────────────────────────────────────────────────────────────────
// Presigned PUT — il client riceve un URL temporaneo per fare PUT diretto
// senza vedere mai le credenziali R2.
// ──────────────────────────────────────────────────────────────────────────

const PRESIGN_TTL_SECONDS = 300; // 5 min: copre upload anche su connessioni lente

export interface PresignedUpload {
  uploadUrl: string;
  /** Header REQUIRED dal client durante il PUT — devono matchare quanto
   *  firmato lato server o R2 rifiuta con SignatureDoesNotMatch. */
  headers: Record<string, string>;
  expiresAt: number;
}

export async function createMediaPresignedPut(opts: {
  cfg: MediaR2Config;
  key: string;
  contentType: MediaMime;
}): Promise<PresignedUpload> {
  const client = createMediaR2Client(opts.cfg);
  const cmd = new PutObjectCommand({
    Bucket: opts.cfg.bucket,
    Key: opts.key,
    ContentType: opts.contentType,
    // Niente CacheControl qui: lo settiamo nel confirm via copyObject solo se
    // serve. Per ora gli asset CMS sono serviti con default CF (~hours).
  });
  const uploadUrl = await getSignedUrl(client, cmd, { expiresIn: PRESIGN_TTL_SECONDS });
  return {
    uploadUrl,
    headers: { "Content-Type": opts.contentType },
    expiresAt: Date.now() + PRESIGN_TTL_SECONDS * 1000,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Object operations
// ──────────────────────────────────────────────────────────────────────────

/**
 * HEAD per verificare che il file esista nel bucket dopo il PUT del client.
 * Ritorna size + content-type effettivi (utili per double-check vs ciò che
 * il client dichiarava).
 */
export async function headMediaObject(
  cfg: MediaR2Config,
  key: string,
): Promise<{ contentType?: string; contentLength?: number } | null> {
  try {
    const client = createMediaR2Client(cfg);
    const res = await client.send(
      new HeadObjectCommand({ Bucket: cfg.bucket, Key: key }),
    );
    return {
      contentType: res.ContentType,
      contentLength: res.ContentLength,
    };
  } catch (err: unknown) {
    const code =
      (err as { name?: string; Code?: string })?.name ??
      (err as { Code?: string })?.Code;
    const status =
      (err as { $metadata?: { httpStatusCode?: number } })?.$metadata
        ?.httpStatusCode;
    if (code === "NotFound" || code === "NoSuchKey" || status === 404) {
      return null;
    }
    throw err;
  }
}

/**
 * Scarica il body come stringa UTF-8. Usato per la sanitize SVG: leggiamo
 * quello che il client ha PUT, lo passiamo a sanitize-html, e lo ri-uppiamo
 * via putMediaObject (upsert sulla stessa key).
 */
export async function getMediaObjectAsText(
  cfg: MediaR2Config,
  key: string,
): Promise<string | null> {
  try {
    const client = createMediaR2Client(cfg);
    const res = await client.send(
      new GetObjectCommand({ Bucket: cfg.bucket, Key: key }),
    );
    const body = await res.Body?.transformToString("utf-8");
    return body ?? null;
  } catch (err: unknown) {
    const code =
      (err as { name?: string; Code?: string })?.name ??
      (err as { Code?: string })?.Code;
    if (code === "NoSuchKey" || code === "NotFound") return null;
    throw err;
  }
}

/**
 * Upload server-side di un Buffer (usato per la re-upload SVG sanitizzato).
 * Per gli upload normali si usa il presigned PUT lato client — questa
 * funzione esiste solo per il post-processing.
 */
export async function putMediaObject(opts: {
  cfg: MediaR2Config;
  key: string;
  body: Buffer | string;
  contentType: string;
}): Promise<void> {
  const client = createMediaR2Client(opts.cfg);
  await client.send(
    new PutObjectCommand({
      Bucket: opts.cfg.bucket,
      Key: opts.key,
      Body: opts.body,
      ContentType: opts.contentType,
    }),
  );
}

/**
 * Rimuove un oggetto. Idempotente: 404 non solleva. Il caller resta
 * responsabile della riga DB.
 */
export async function deleteMediaObject(
  cfg: MediaR2Config,
  key: string,
): Promise<void> {
  try {
    const client = createMediaR2Client(cfg);
    await client.send(
      new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }),
    );
  } catch (err) {
    console.error(`[r2-media] DELETE failed for ${key}:`, err);
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Connection test (per il bottone admin)
// ──────────────────────────────────────────────────────────────────────────

export type MediaR2ConnectionResult =
  | { ok: true }
  | {
      ok: false;
      reason: "missing_config" | "forbidden" | "not_found" | "network" | "timeout" | "unknown";
      detail?: string;
    };

export async function checkMediaR2Connection(
  cfg: MediaR2Config,
): Promise<MediaR2ConnectionResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const client = createMediaR2Client(cfg);
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
        ? (err as { $metadata?: { httpStatusCode?: number } }).$metadata
            ?.httpStatusCode
        : undefined;
    if (status === 401 || status === 403) {
      return { ok: false, reason: "forbidden" };
    }
    if (status === 404) {
      return { ok: false, reason: "not_found" };
    }
    const message = err instanceof Error ? err.message : String(err);
    if (
      err instanceof TypeError ||
      /network|fetch failed|ECONNREFUSED|ENOTFOUND|getaddrinfo/i.test(message)
    ) {
      return { ok: false, reason: "network", detail: message };
    }
    return { ok: false, reason: "unknown", detail: message };
  } finally {
    clearTimeout(timeout);
  }
}
