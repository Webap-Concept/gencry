// lib/storage/r2-assets.ts
//
// Storage degli asset di brand core (logo, favicon, OG default, PWA icons)
// su Cloudflare R2. Bucket dedicato `assets` con custom domain.
// Settings in `storage.assets.r2.*` configurabili da
// /admin/services/cloudflare (card "R2 storage — assets").
//
// Architettura: stesso pattern di r2-avatars.ts / r2-media.ts. Token
// isolato per-bucket (security best practice). `accountId` globale in
// `storage.r2.account_id` perché l'account Cloudflare è unico per cliente.
//
// No fallback Supabase: se R2 non configurato → errore esplicito al
// caller (zero dual-backend complexity).
//
// Filename pattern: `<slot>-<timestamp>.<ext>` (cache-bust per upload
// incrementali — la public URL cambia ad ogni upload anche se la coppia
// slot+ext è la stessa).
import "server-only";

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";
import { getAppSettings } from "@/lib/db/settings-queries";

export interface AssetsR2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl: string; // senza trailing slash
}

export async function loadAssetsR2Config(): Promise<AssetsR2Config | null> {
  const s = await getAppSettings();
  const accountId       = (s["storage.r2.account_id"]               ?? "").trim();
  const accessKeyId     = (s["storage.assets.r2.access_key_id"]     ?? "").trim();
  const secretAccessKey = (s["storage.assets.r2.secret_access_key"] ?? "").trim();
  const bucket          = (s["storage.assets.r2.bucket"]            ?? "").trim();
  const publicBaseUrl   = (s["storage.assets.r2.public_base_url"]   ?? "").trim().replace(/\/+$/, "");
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBaseUrl) {
    return null;
  }
  return { accountId, accessKeyId, secretAccessKey, bucket, publicBaseUrl };
}

export function createAssetsR2Client(cfg: AssetsR2Config): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  });
}

/**
 * Upload buffer sul bucket asset. Caller responsabile per:
 *  - mime check
 *  - size check
 *  - key univocità (timestamp suffix gestito dal layer branding.ts).
 *
 * Cache-Control aggressivo perché la key è sempre unica (timestamp);
 * niente bisogno di cache-bust runtime sull'URL — la nuova upload =
 * nuova key = nuovo URL.
 */
export async function putAssetObject(opts: {
  cfg: AssetsR2Config;
  key: string;
  body: Buffer;
  contentType: string;
}): Promise<void> {
  const client = createAssetsR2Client(opts.cfg);
  await client.send(
    new PutObjectCommand({
      Bucket: opts.cfg.bucket,
      Key: opts.key,
      Body: opts.body,
      ContentType: opts.contentType,
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
}

/**
 * Cancella un object dal bucket. Idempotente: 404 swallowato (asset già
 * orfano / non più presente).
 */
export async function deleteAssetObject(
  cfg: AssetsR2Config,
  key: string,
): Promise<void> {
  try {
    const client = createAssetsR2Client(cfg);
    await client.send(
      new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }),
    );
  } catch (err) {
    console.error(`[r2-assets] DELETE failed for ${key}:`, err);
  }
}

/**
 * Public URL deterministico per una key. Il bucket dev'essere esposto via
 * custom domain (es. https://assets.<dominio>) — `publicBaseUrl` è quello.
 */
export function getAssetPublicUrl(cfg: AssetsR2Config, key: string): string {
  return `${cfg.publicBaseUrl}/${key}`;
}

/**
 * Dato un public URL (es. https://assets.<dominio>/logo-1735000000.png),
 * estrae la key per il delete. Ritorna null se l'URL non appartiene a
 * questo bucket (es. URL legacy Supabase Storage rimasti nei settings).
 */
export function extractKeyFromPublicUrl(
  cfg: AssetsR2Config,
  publicUrl: string,
): string | null {
  const prefix = `${cfg.publicBaseUrl}/`;
  if (!publicUrl.startsWith(prefix)) return null;
  return publicUrl.slice(prefix.length);
}

// ──────────────────────────────────────────────────────────────────────────
// Connection test (per il bottone Test connection nell'admin)
// ──────────────────────────────────────────────────────────────────────────

export type AssetsR2ConnectionResult =
  | { ok: true }
  | {
      ok: false;
      reason: "missing_config" | "forbidden" | "not_found" | "network" | "timeout" | "unknown";
      detail?: string;
    };

export async function checkAssetsR2Connection(
  cfg: AssetsR2Config,
): Promise<AssetsR2ConnectionResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const client = createAssetsR2Client(cfg);
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
