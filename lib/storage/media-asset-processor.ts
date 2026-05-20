// lib/storage/media-asset-processor.ts
//
// Processore di asset della media library. Chiamato dal confirm upload:
// dopo che il file è stato uppato su R2 e verificato presente, ne
// generiamo 3 varianti webp ottimizzate (`hero/card/thumb`), uploadate
// accanto all'originale, e l'originale viene cancellato.
//
// Modulo-agnostic: vive in `lib/storage/` perché è una concern della
// media library del CMS, non di un modulo specifico. Chi consuma le
// varianti (modulo news, future copertine editoriali, qualsiasi cosa
// che pesca un asset dalla library) legge `media_assets.variants` con
// l'helper `pickHeroVariantUrl()`.
//
// Skip rules:
//   - mime non image/* (PDF, video, ecc.) → no-op
//   - svg → no-op (non si converte sensatamente a webp raster)
//   - gif → no-op (perderemmo l'animazione)
//   - lato max < 600px → no-op (icone, loghi piccoli, avatar — il
//     payload originale è già piccolo, processarli non porta valore)
//
// Idempotent: se `media_assets.variants` è già popolato, ritorna il
// JSON corrente senza ri-fare il lavoro.
import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { mediaAssets } from "@/lib/db/schema";
import {
  processImageToWebpVariants,
  type ProcessedVariant,
} from "@/lib/storage/image-pipeline";
import sharp from "sharp";
import {
  deleteMediaObject,
  loadMediaR2Config,
  putMediaObject,
  type MediaR2Config,
  createMediaR2Client,
} from "@/lib/storage/r2-media";
import { GetObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import type { Readable } from "stream";

export interface MediaVariantInfo {
  url: string;
  w: number;
  h: number;
  size: number;
}
export interface MediaVariantsJson {
  hero: MediaVariantInfo;
  card: MediaVariantInfo;
  thumb: MediaVariantInfo;
}

const VARIANTS = [
  { name: "hero",  maxSide: 1600, quality: 82 },
  { name: "card",  maxSide: 800,  quality: 78 },
  { name: "thumb", maxSide: 400,  quality: 72 },
] as const;

const MIN_SIDE_PX = 600;

const RASTER_MIME_RX = /^image\/(jpeg|png|webp|avif)$/i;

export class MediaAssetProcessorNotConfiguredError extends Error {
  constructor() {
    super("media.processor.r2_not_configured");
    this.name = "MediaAssetProcessorNotConfiguredError";
  }
}
export class MediaAssetProcessorNotFoundError extends Error {
  constructor() {
    super("media.processor.asset_not_found");
    this.name = "MediaAssetProcessorNotFoundError";
  }
}

/** Risultato del processing: null se skippato (mime non supportato,
 *  immagine troppo piccola, ecc.); altrimenti il JSON delle varianti. */
export type ProcessResult = MediaVariantsJson | null;

function variantKey(originalKey: string, variantName: string): string {
  const dot = originalKey.lastIndexOf(".");
  const stem = dot > 0 ? originalKey.slice(0, dot) : originalKey;
  return `${stem}-${variantName}.webp`;
}

function publicUrlFor(cfg: MediaR2Config, key: string): string {
  return `${cfg.publicBaseUrl}/${key}`;
}

async function fetchObjectAsBuffer(
  client: S3Client,
  bucket: string,
  key: string,
): Promise<Buffer> {
  const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const stream = res.Body as Readable;
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * Processa un asset della media library in 3 varianti webp. Best-effort:
 * il caller (confirmMediaUpload) NON deve bloccare la response su un
 * errore qui — il file originale è comunque servibile, le varianti sono
 * un layer di ottimizzazione opzionale.
 *
 * Ritorna `null` se l'asset è stato volutamente skippato (vedi
 * "Skip rules" nel doc di file).
 */
export async function processMediaAsset(assetId: number): Promise<ProcessResult> {
  const [asset] = await db
    .select({
      id: mediaAssets.id,
      storagePath: mediaAssets.storagePath,
      mime: mediaAssets.mime,
      width: mediaAssets.width,
      height: mediaAssets.height,
      variants: mediaAssets.variants,
    })
    .from(mediaAssets)
    .where(eq(mediaAssets.id, assetId))
    .limit(1);

  if (!asset) throw new MediaAssetProcessorNotFoundError();

  // Idempotency: già processato → ritorna il JSON corrente.
  if (asset.variants && isCompleteVariants(asset.variants)) {
    return asset.variants as MediaVariantsJson;
  }

  // Skip per mime non raster.
  if (!RASTER_MIME_RX.test(asset.mime)) return null;

  // Skip se l'asset è palesemente piccolo (controllo DB-side: il media
  // library salva width/height al ticket creation in alcuni flow,
  // altrimenti restano null e cadiamo sul check post-download).
  if (
    asset.width != null &&
    asset.height != null &&
    Math.max(asset.width, asset.height) < MIN_SIDE_PX
  ) {
    return null;
  }

  const cfg = await loadMediaR2Config();
  if (!cfg) throw new MediaAssetProcessorNotConfiguredError();

  const client = createMediaR2Client(cfg);

  let raw: Buffer;
  try {
    raw = await fetchObjectAsBuffer(client, cfg.bucket, asset.storagePath);
  } catch (err: unknown) {
    const code =
      (err as { name?: string; Code?: string })?.name ??
      (err as { Code?: string })?.Code;
    if (code === "NoSuchKey" || code === "NotFound") {
      // Asset orfano (file mai arrivato o cancellato manualmente). Niente
      // da processare. Il caller decide se è errore o no.
      return null;
    }
    throw err;
  }

  // Controllo dimensioni post-download (se non c'erano DB-side).
  if (asset.width == null || asset.height == null) {
    try {
      const meta = await sharp(raw).metadata();
      if ((meta.width ?? 0) < MIN_SIDE_PX && (meta.height ?? 0) < MIN_SIDE_PX) {
        return null;
      }
    } catch {
      // Se sharp non sa leggere i metadata, lasciamo proseguire e fail
      // controllato dentro la pipeline (es. file corrotto).
    }
  }

  const processed = await processImageToWebpVariants(raw, VARIANTS);

  const uploads = await Promise.all(
    processed.map(async (v) => {
      const key = variantKey(asset.storagePath, v.name);
      await putMediaObject({ cfg, key, body: v.buffer, contentType: "image/webp" });
      return { variant: v, key };
    }),
  );

  const variantsJson = buildVariantsJson(cfg, uploads);

  // Cancella l'originale (zero storage waste, allineato a posts).
  await deleteMediaObject(cfg, asset.storagePath);

  // Aggiorna `publicUrl` puntando alla variante `card`: tutti i caller
  // che leggono `media_assets.publicUrl` senza guardare `variants`
  // (media library list, picker preview, ecc.) continuano a funzionare
  // senza serve refactor. `card` è la taglia intermedia, va bene sia
  // per preview admin che per rendering generale. `storagePath` resta
  // invariato come identity key (delete sarà idempotente: 404 no-op).
  await db
    .update(mediaAssets)
    .set({
      variants: variantsJson,
      publicUrl: variantsJson.card.url,
      mime: "image/webp",
    })
    .where(eq(mediaAssets.id, assetId));

  return variantsJson;
}

function buildVariantsJson(
  cfg: MediaR2Config,
  uploads: { variant: ProcessedVariant; key: string }[],
): MediaVariantsJson {
  const find = (name: string) => {
    const u = uploads.find((x) => x.variant.name === name);
    if (!u) throw new Error(`media.processor.missing_variant:${name}`);
    return {
      url: publicUrlFor(cfg, u.key),
      w: u.variant.width,
      h: u.variant.height,
      size: u.variant.sizeBytes,
    };
  };
  return {
    hero: find("hero"),
    card: find("card"),
    thumb: find("thumb"),
  };
}

function isCompleteVariants(v: unknown): v is MediaVariantsJson {
  if (!v || typeof v !== "object") return false;
  const o = v as Partial<MediaVariantsJson>;
  return !!(o.hero?.url && o.card?.url && o.thumb?.url);
}

/**
 * Lookup helper per i renderer. Dato un media_assets con `variants`
 * popolato, ritorna l'URL della variante richiesta. Fallback al
 * publicUrl originale se le varianti non esistono (asset non
 * processato — es. uploadati prima del wiring del processor, o
 * skippati per dimensioni piccole).
 */
export function pickMediaVariantUrl(
  variants: unknown,
  fallbackPublicUrl: string,
  which: keyof MediaVariantsJson,
): string {
  if (isCompleteVariants(variants)) return variants[which].url;
  return fallbackPublicUrl;
}

/**
 * Costruisce la stringa `srcset` con tutte le varianti webp disponibili,
 * pronta per <img srcSet={...}>. Il browser sceglie automaticamente la
 * variante più adatta in base a viewport effettivo + devicePixelRatio.
 *
 * Esempio output:
 *   "<thumb> 400w, <card> 800w, <hero> 1600w"
 *
 * Width dichiarate usano `w` come la *width reale* della variante:
 *   thumb 400w (lato lungo 400px)
 *   card  800w (lato lungo 800px)
 *   hero  1600w (lato lungo 1600px)
 *
 * Ritorna `undefined` se le varianti non sono ancora popolate (asset
 * pre-processing): il caller serve solo `src` fallback senza srcset
 * — il browser si limita a quella, niente regressione visiva.
 *
 * IMPORTANTE: senza un attributo `sizes` complementare il browser
 * tratta srcset come se ogni candidato fosse al 100vw. Per ottenere
 * il risparmio voluto su mobile/desktop, il caller DEVE passare anche
 * un `sizes` che descriva quanto largo apparirà l'<img> a vista
 * (es. "(max-width: 700px) 100vw, 1024px").
 */
export function getMediaSrcset(variants: unknown): string | undefined {
  if (!isCompleteVariants(variants)) return undefined;
  return `${variants.thumb.url} 400w, ${variants.card.url} 800w, ${variants.hero.url} 1600w`;
}
