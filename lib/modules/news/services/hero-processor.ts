// lib/modules/news/services/hero-processor.ts
//
// Processa un media_assets row (l'hero scelto dall'admin in review)
// in 3 varianti webp ottimizzate per i diversi contesti del blog:
//
//   - hero  → article body (16:10 full bleed), 1600×… q82
//   - card  → featured-grid + featured-story (~800×500), 800×… q78
//   - thumb → essays / pick miniatures (~400×250), 400×… q72
//
// Le 3 varianti vengono uploadate su R2 (stesso bucket della media
// library) con naming convention `{basename}-{variant}.webp` accanto
// all'originale. L'originale viene cancellato per allineamento al
// pattern posts (zero storage waste).
//
// Le URL + dimensioni sono salvate in `media_assets.variants` (JSONB)
// per lookup deterministico dai renderer. Idempotente: se `variants`
// è già popolato per l'asset, no-op.
//
// Hookable: stessa filosofia di posts/media-processor — V2 può
// sostituire con worker queue mantenendo la signature pubblica.
import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { mediaAssets } from "@/lib/db/schema";
import {
  processImageToWebpVariants,
  type ProcessedVariant,
} from "@/lib/storage/image-pipeline";
import {
  deleteMediaObject,
  loadMediaR2Config,
  putMediaObject,
  type MediaR2Config,
} from "@/lib/storage/r2-media";
import {
  GetObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createMediaR2Client } from "@/lib/storage/r2-media";
import type { Readable } from "stream";

export interface HeroVariantInfo {
  url: string;
  w: number;
  h: number;
  size: number;
}
export interface HeroVariantsJson {
  hero: HeroVariantInfo;
  card: HeroVariantInfo;
  thumb: HeroVariantInfo;
}

const NEWS_HERO_VARIANTS = [
  { name: "hero",  maxSide: 1600, quality: 82 },
  { name: "card",  maxSide: 800,  quality: 78 },
  { name: "thumb", maxSide: 400,  quality: 72 },
] as const;

export class HeroProcessorNotConfiguredError extends Error {
  constructor() {
    super("news.hero.r2_not_configured");
    this.name = "HeroProcessorNotConfiguredError";
  }
}
export class HeroProcessorAssetNotFoundError extends Error {
  constructor() {
    super("news.hero.asset_not_found");
    this.name = "HeroProcessorAssetNotFoundError";
  }
}
export class HeroProcessorOriginalMissingError extends Error {
  constructor() {
    super("news.hero.original_missing");
    this.name = "HeroProcessorOriginalMissingError";
  }
}

/**
 * Costruisce la key R2 di una variante dato il path originale.
 * Esempio: `media/2026/05/abc-123.jpg` + "hero" → `media/2026/05/abc-123-hero.webp`.
 * Il basename (senza ext) + suffisso `-<variant>.webp` è deterministic
 * e collision-free perché lo storage_path originale è già UUID-based.
 */
function variantKey(originalKey: string, variantName: string): string {
  const dot = originalKey.lastIndexOf(".");
  const stem = dot > 0 ? originalKey.slice(0, dot) : originalKey;
  return `${stem}-${variantName}.webp`;
}

/**
 * Public URL deterministico per una key. Mirror di getMediaPublicUrl
 * (helper interno a r2-media.ts) ma localizzato qui per non aggiungere
 * un import circolare; resta `${publicBaseUrl}/${key}`.
 */
function publicUrlFor(cfg: MediaR2Config, key: string): string {
  return `${cfg.publicBaseUrl}/${key}`;
}

/**
 * Scarica un object R2 come Buffer. Inline qui invece di esporlo da
 * r2-media.ts per limitare la superficie del modulo storage — se
 * altri caller ne avranno bisogno, lo promuoviamo a helper pubblico.
 */
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
 * Processa l'hero asset. Idempotente: se l'asset ha già `variants`
 * popolato, ritorna quel JSON senza ri-fare il lavoro (cheap path
 * per Save draft chiamato N volte sullo stesso asset).
 *
 * Tempistica: ~1-2s a freddo (download + 3 sharp + 3 upload). La
 * server action chiamante può tenerlo sincrono in V1 — UX accettabile
 * sul click di Save/Publish nel review editor.
 */
export async function processHeroAsset(
  assetId: number,
): Promise<HeroVariantsJson> {
  const cfg = await loadMediaR2Config();
  if (!cfg) throw new HeroProcessorNotConfiguredError();

  const [asset] = await db
    .select({
      id: mediaAssets.id,
      storagePath: mediaAssets.storagePath,
      variants: mediaAssets.variants,
    })
    .from(mediaAssets)
    .where(eq(mediaAssets.id, assetId))
    .limit(1);

  if (!asset) throw new HeroProcessorAssetNotFoundError();

  // Idempotency: già processato → restituisci il JSON corrente.
  if (asset.variants && isCompleteVariants(asset.variants)) {
    return asset.variants as HeroVariantsJson;
  }

  const client = createMediaR2Client(cfg);

  // Scarica originale. Se manca, l'admin ha caricato un hero che è
  // stato manualmente cancellato dal bucket — errore esplicito.
  let raw: Buffer;
  try {
    raw = await fetchObjectAsBuffer(client, cfg.bucket, asset.storagePath);
  } catch (err: unknown) {
    const code =
      (err as { name?: string; Code?: string })?.name ??
      (err as { Code?: string })?.Code;
    if (code === "NoSuchKey" || code === "NotFound") {
      throw new HeroProcessorOriginalMissingError();
    }
    throw err;
  }

  const processed = await processImageToWebpVariants(raw, NEWS_HERO_VARIANTS);

  // Upload parallelo delle 3 varianti.
  const uploads = await Promise.all(
    processed.map(async (v) => {
      const key = variantKey(asset.storagePath, v.name);
      await putMediaObject({
        cfg,
        key,
        body: v.buffer,
        contentType: "image/webp",
      });
      return { variant: v, key };
    }),
  );

  // Costruisco il JSON delle varianti.
  const variantsJson = buildVariantsJson(cfg, uploads);

  // Cancella l'originale (allineato a posts: zero storage waste).
  // Idempotente se 404 (vedi deleteMediaObject in r2-media.ts).
  await deleteMediaObject(cfg, asset.storagePath);

  // Persisti il JSON nel DB. Niente bump di confirmedAt qui — l'asset
  // era già confermato; stiamo solo aggiungendo le varianti.
  await db
    .update(mediaAssets)
    .set({ variants: variantsJson })
    .where(eq(mediaAssets.id, assetId));

  return variantsJson;
}

function buildVariantsJson(
  cfg: MediaR2Config,
  uploads: { variant: ProcessedVariant; key: string }[],
): HeroVariantsJson {
  const find = (name: string) => {
    const u = uploads.find((x) => x.variant.name === name);
    if (!u) {
      throw new Error(`news.hero.missing_variant:${name}`);
    }
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

function isCompleteVariants(v: unknown): v is HeroVariantsJson {
  if (!v || typeof v !== "object") return false;
  const o = v as Partial<HeroVariantsJson>;
  return !!(o.hero?.url && o.card?.url && o.thumb?.url);
}

/**
 * Lookup helper per i renderer. Dato un media_assets con `variants`
 * popolato, ritorna l'URL della variante richiesta. Fallback al
 * publicUrl originale se le varianti non esistono ancora (article
 * pre-processing — non dovrebbe succedere in produzione perché il
 * processing è triggered al pick hero).
 */
export function pickHeroVariantUrl(
  variants: unknown,
  fallbackPublicUrl: string,
  which: keyof HeroVariantsJson,
): string {
  if (isCompleteVariants(variants)) return variants[which].url;
  return fallbackPublicUrl;
}
