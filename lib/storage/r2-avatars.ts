// lib/storage/r2-avatars.ts
//
// Storage avatar utente su Cloudflare R2 (core feature, non-modulo).
// Bucket dedicato `avatars` con custom domain dedicato — settings configurate
// dall'admin in /admin/services/cloudflare (card "R2 storage — avatars").
//
// Architettura: stesso pattern del modulo prices (lib/modules/prices/storage.ts)
// ma con scope core e settings separate (`storage.avatar.r2.*`). I due servizi
// R2 hanno token diversi per isolamento di security — vedi
// project_avatar_r2_refactor_todo.md per il razionale.
//
// Image processing: lo facciamo lato CLIENT (avatar-crop-dialog produce un
// File 512×512 JPEG via canvas, che strippa EXIF nativamente). Niente sharp
// server-side: bastano i guardrail di mime+size, e l'admin si fida che il
// crop dialog è la sorgente di verità per le dimensioni.
//
// No fallback Supabase: se R2 non configurato → errore esplicito al caller.
// Decisione 2026-05-12 per evitare la complessità del dual-backend.
import "server-only";

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";
import { getAppSettings } from "@/lib/db/settings-queries";

export interface AvatarR2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl: string; // senza trailing slash
}

/**
 * Legge la config R2 avatar da app_settings. Ritorna null se anche solo una
 * delle 5 chiavi è vuota — il caller deve restituire un errore esplicito,
 * NON fallbackare a Supabase.
 *
 * `accountId` viene dalla chiave GLOBAL `storage.r2.account_id` (account
 * Cloudflare unico per cliente). Le altre 4 chiavi sono specifiche del bucket
 * avatar perché ogni bucket ha il proprio token (isolamento security).
 */
export async function loadAvatarR2Config(): Promise<AvatarR2Config | null> {
  const s = await getAppSettings();
  const accountId       = (s["storage.r2.account_id"]               ?? "").trim();
  const accessKeyId     = (s["storage.avatar.r2.access_key_id"]     ?? "").trim();
  const secretAccessKey = (s["storage.avatar.r2.secret_access_key"] ?? "").trim();
  const bucket          = (s["storage.avatar.r2.bucket"]            ?? "").trim();
  const publicBaseUrl   = (s["storage.avatar.r2.public_base_url"]   ?? "").trim().replace(/\/+$/, "");
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBaseUrl) {
    return null;
  }
  return { accountId, accessKeyId, secretAccessKey, bucket, publicBaseUrl };
}

export function createAvatarR2Client(cfg: AvatarR2Config): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  });
}

const ALLOWED_MIME = ["image/png", "image/jpeg", "image/webp"] as const;
type AllowedMime = (typeof ALLOWED_MIME)[number];

function extFromMime(mime: AllowedMime): "png" | "jpg" | "webp" {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

function avatarKey(userId: string, ext: "png" | "jpg" | "webp"): string {
  // Niente subfolder, niente prefisso "avatars/" — il bucket è già dedicato
  // (`avatars`), un prefix duplicherebbe il concetto.
  return `${userId}.${ext}`;
}

/**
 * Upload diretto del buffer su R2. Il caller deve garantire che:
 *  - mime ∈ ALLOWED_MIME
 *  - dimensioni accettabili (verificate a livello action: 2MB cap)
 *  - resize già applicato lato client (avatar-crop-dialog → 512×512)
 *
 * Ritorna l'URL pubblico con cache-bust `?v=<ts>` così browser/CDN
 * ricaricano dopo un re-upload (la key è stabile per user+ext).
 */
export async function uploadAvatarToR2(
  userId: string,
  buffer: Buffer,
  mime: string,
): Promise<{ url: string } | { error: string }> {
  if (!(ALLOWED_MIME as readonly string[]).includes(mime)) {
    return { error: "Formato non supportato. Usa PNG, JPG o WebP." };
  }
  const cfg = await loadAvatarR2Config();
  if (!cfg) {
    return {
      error:
        "Storage R2 per avatar non configurato. Chiedi all'admin di completare /admin/services/cloudflare → R2 (avatar).",
    };
  }

  const ext = extFromMime(mime as AllowedMime);
  const key = avatarKey(userId, ext);
  // Timeout 15s sul PUT: se R2 non risponde (DNS fail, credenziali fittizie
  // con endpoint non raggiungibile, ecc.) la action non deve appenderci la
  // UI in pending state. AbortController + abortSignal → S3 client butta
  // l'errore in tempo finito e il caller mostra un toast.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const client = createAvatarR2Client(cfg);
    await client.send(
      new PutObjectCommand({
        Bucket: cfg.bucket,
        Key: key,
        Body: buffer,
        ContentType: mime,
        // Cache aggressiva: la key è stabile per user+ext (sovrascrivibile),
        // la cache-bust è gestita dal `?v=<ts>` sull'URL pubblico.
        CacheControl: "public, max-age=31536000, immutable",
      }),
      { abortSignal: controller.signal },
    );
  } catch (err) {
    console.error("[r2-avatars] R2 PUT failed:", err);
    if (err instanceof Error && err.name === "AbortError") {
      return { error: "Timeout (15s) nel caricamento su R2. Verifica le credenziali in /admin/services/cloudflare." };
    }
    return { error: "Caricamento R2 fallito. Riprova." };
  } finally {
    clearTimeout(timeout);
  }

  return { url: `${cfg.publicBaseUrl}/${key}?v=${Date.now()}` };
}

/**
 * Variante "from URL" usata dall'OAuth Google (lib/auth/oauth/index.ts) per
 * mirrorare la picture dell'utente al primo login.
 *
 * Ritorna `null` invece di un errore: il caller fa best-effort e cade
 * sull'URL originale OAuth se R2 non disponibile (l'OAuth flow non deve
 * fallire per un avatar).
 */
/**
 * Normalizza la risoluzione di un avatar OAuth verso 512px, così l'avatar
 * importato e' nitido su display retina (i nostri avatar arrivano a 96px
 * CSS → 288px @3x, ben sotto i 512). No-op per URL non riconosciuti.
 *
 * Google (`*.googleusercontent.com`): il suffisso `=sNN-c` controlla la
 * dimensione e di default OAuth restituisce `=s96-c` (sgranato). Lo
 * forziamo a `=s512`, stessa risoluzione del crop dialog manuale.
 */
function maxResAvatarUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname.endsWith("googleusercontent.com")) {
      // "=s96-c" | "=s96" → "=s512-c" | "=s512" (preserva il -c se c'e').
      return url.replace(/=s\d+(-c)?(?=$|&)/, "=s512$1");
    }
  } catch {
    // URL malformato → lo passiamo invariato al fetch (fallira' lui).
  }
  return url;
}

export async function uploadAvatarFromUrlToR2(
  userId: string,
  sourceUrl: string,
): Promise<string | null> {
  const cfg = await loadAvatarR2Config();
  if (!cfg) return null;

  try {
    const res = await fetch(maxResAvatarUrl(sourceUrl));
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    const rawMime = res.headers.get("content-type")?.split(";")[0]?.trim() ?? "image/jpeg";
    const cleanMime = (ALLOWED_MIME as readonly string[]).includes(rawMime)
      ? rawMime
      : "image/jpeg";
    const result = await uploadAvatarToR2(userId, buffer, cleanMime);
    if ("error" in result) return null;
    return result.url;
  } catch (err) {
    console.error("[r2-avatars] uploadAvatarFromUrlToR2 failed:", err);
    return null;
  }
}

/**
 * Cancella l'avatar dell'utente dal bucket R2. Best-effort: errori loggati
 * ma non rilanciati (la rimozione DB del DB.userProfiles.avatarUrl è
 * comunque andata, l'orphan R2 è recuperabile col cleanup futuro).
 *
 * Tenta entrambe le estensioni perché l'avatar è salvato come .png/.jpg/.webp
 * a seconda del file di partenza, e non conosciamo l'ext dal `avatarUrl`
 * (cache-bust suffix). Cancellarne 3 è più rapido che parsare l'URL.
 */
export async function deleteAvatarFromR2(userId: string): Promise<void> {
  const cfg = await loadAvatarR2Config();
  if (!cfg) return;
  try {
    const client = createAvatarR2Client(cfg);
    await Promise.all(
      (["png", "jpg", "webp"] as const).map((ext) =>
        client
          .send(
            new DeleteObjectCommand({ Bucket: cfg.bucket, Key: avatarKey(userId, ext) }),
          )
          .catch(() => {
            /* 404 su un'estensione non-presente è atteso */
          }),
      ),
    );
  } catch (err) {
    console.error(`[r2-avatars] R2 DELETE failed for ${userId}:`, err);
  }
}

/**
 * Test di connessione R2 per il bottone "Test connection" admin.
 * HeadBucket = 1 chiamata leggera che valida credenziali + accesso bucket.
 */
export type AvatarR2ConnectionResult =
  | { ok: true }
  | {
      ok: false;
      reason: "missing_config" | "forbidden" | "not_found" | "network" | "timeout" | "unknown";
      detail?: string;
    };

export async function checkAvatarsR2Connection(
  cfg: AvatarR2Config,
): Promise<AvatarR2ConnectionResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const client = createAvatarR2Client(cfg);
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
