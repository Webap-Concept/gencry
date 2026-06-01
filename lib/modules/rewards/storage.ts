// lib/modules/rewards/storage.ts
//
// Bucket R2 dedicato al modulo rewards.
// Contiene: icone badge (rewards/badges/<id>.<ext>), icona GCC (rewards/branding/*).
// Settings: modules.rewards.r2.* + storage.r2.account_id (globale).
// Pattern identico a lib/modules/posts/storage.ts.
import "server-only";

import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getAppSettings } from "@/lib/db/settings-queries";

export interface RewardsR2Config {
  accountId:       string;
  accessKeyId:     string;
  secretAccessKey: string;
  bucket:          string;
  publicBaseUrl:   string; // senza trailing slash
}

export async function loadRewardsR2Config(): Promise<RewardsR2Config | null> {
  const s = await getAppSettings();
  const accountId       = (s["storage.r2.account_id"]                  ?? "").trim();
  const accessKeyId     = (s["modules.rewards.r2.access_key_id"]       ?? "").trim();
  const secretAccessKey = (s["modules.rewards.r2.secret_access_key"]   ?? "").trim();
  const bucket          = (s["modules.rewards.r2.bucket"]              ?? "").trim();
  const publicBaseUrl   = (s["modules.rewards.r2.public_base_url"]     ?? "").trim().replace(/\/+$/, "");
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBaseUrl) {
    return null;
  }
  return { accountId, accessKeyId, secretAccessKey, bucket, publicBaseUrl };
}

export function createRewardsR2Client(cfg: RewardsR2Config): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId:     cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  });
}

const ALLOWED_MIME = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"] as const;
type AllowedMime = (typeof ALLOWED_MIME)[number];

export function isAllowedBadgeIconMime(mime: string): mime is AllowedMime {
  return (ALLOWED_MIME as readonly string[]).includes(mime);
}

function extFromMime(mime: AllowedMime): string {
  if (mime === "image/png")     return "png";
  if (mime === "image/webp")    return "webp";
  if (mime === "image/svg+xml") return "svg";
  return "jpg";
}

function badgeIconKey(itemId: string, ext: string): string {
  return `rewards/badges/${itemId}.${ext}`;
}

export interface BadgeIconTicket {
  uploadUrl:     string;
  uploadHeaders: Record<string, string>;
  contentType:   string;
  publicUrl:     string;
  key:           string;
}

/**
 * Firma un presigned PUT URL per l'icona di un catalog item.
 * TTL 5 minuti (upload lato admin, bassa frequenza).
 */
export async function signBadgeIconPut(
  itemId: string,
  mimeType: string,
): Promise<BadgeIconTicket | { error: string }> {
  if (!isAllowedBadgeIconMime(mimeType)) {
    return { error: `MIME non supportato: ${mimeType}. Usa PNG, JPEG, WebP o SVG.` };
  }
  const cfg = await loadRewardsR2Config();
  if (!cfg) return { error: "R2 rewards non configurato. Vai in Admin → Rewards → Settings → R2." };

  const ext = extFromMime(mimeType as AllowedMime);
  const key = badgeIconKey(itemId, ext);
  const client = createRewardsR2Client(cfg);

  const url = await getSignedUrl(
    client,
    new PutObjectCommand({ Bucket: cfg.bucket, Key: key, ContentType: mimeType }),
    { expiresIn: 300 },
  );

  return {
    uploadUrl:     url,
    uploadHeaders: { "Content-Type": mimeType },
    contentType:   mimeType,
    publicUrl:     `${cfg.publicBaseUrl}/${key}`,
    key,
  };
}

const COIN_ICON_BASE_KEY = "rewards/branding/coin";

/**
 * Firma un presigned PUT URL per l'icona GCC (branding globale del modulo).
 * Key fissa `rewards/branding/coin.<ext>`: il re-upload sovrascrive l'oggetto;
 * il cache-bust avviene appendendo `?v=<timestamp>` al public URL lato salvataggio.
 */
export async function signCoinIconPut(
  mimeType: string,
): Promise<BadgeIconTicket | { error: string }> {
  if (!isAllowedBadgeIconMime(mimeType)) {
    return { error: `MIME non supportato: ${mimeType}. Usa PNG, JPEG, WebP o SVG.` };
  }
  const cfg = await loadRewardsR2Config();
  if (!cfg) return { error: "R2 rewards non configurato. Vai in Admin → Rewards → Settings → R2." };

  const ext = extFromMime(mimeType as AllowedMime);
  const key = `${COIN_ICON_BASE_KEY}.${ext}`;
  const client = createRewardsR2Client(cfg);

  const url = await getSignedUrl(
    client,
    new PutObjectCommand({ Bucket: cfg.bucket, Key: key, ContentType: mimeType }),
    { expiresIn: 300 },
  );

  return {
    uploadUrl:     url,
    uploadHeaders: { "Content-Type": mimeType },
    contentType:   mimeType,
    publicUrl:     `${cfg.publicBaseUrl}/${key}`,
    key,
  };
}

/** Verifica che l'oggetto sia stato caricato (HeadObject). */
export async function verifyBadgeIcon(key: string): Promise<boolean> {
  const cfg = await loadRewardsR2Config();
  if (!cfg) return false;
  try {
    const client = createRewardsR2Client(cfg);
    await client.send(new HeadObjectCommand({ Bucket: cfg.bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

/** Elimina un'icona badge (cleanup su delete item o sostituzione). */
export async function deleteBadgeIcon(key: string): Promise<void> {
  const cfg = await loadRewardsR2Config();
  if (!cfg) return;
  try {
    const client = createRewardsR2Client(cfg);
    await client.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }));
  } catch {
    // best-effort
  }
}

/** HeadBucket per "Test connection" nella settings page. */
export async function checkRewardsR2Connection(): Promise<{ ok: true } | { ok: false; error: string }> {
  const cfg = await loadRewardsR2Config();
  if (!cfg) return { ok: false, error: "Configurazione R2 mancante." };
  try {
    const client = createRewardsR2Client(cfg);
    await client.send(new HeadBucketCommand({ Bucket: cfg.bucket }));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
