// lib/modules/prices/storage.ts
//
// Helper R2 per il modulo prices: scarica le coin images da CoinGecko,
// caricale sul bucket R2 dedicato (settings nel namespace
// `modules.prices.r2.*`), restituisci l'URL pubblico interno.
//
// Pattern di chiamata:
//   1. Admin aggiunge una nuova coin → addCoinAction chiama
//      `mirrorCoinImage(symbol, sourceUrl)` che:
//        a) GET sourceUrl
//        b) PUT su R2 a `<symbol-lowercase>.<ext>`
//        c) ritorna l'URL pubblico (`<publicBaseUrl>/<key>`) da salvare in DB.
//   2. Backfill cron/admin → cicla le coin con image_url legacy CoinGecko
//      e chiama lo stesso helper.
//
// Se R2 non è configurato (config.r2 === null), `mirrorCoinImage` ritorna
// `null` — i caller fanno fallback all'URL sorgente (UX degradata: il
// frontend pubblico mostra solo iniziali finché R2 non è configurato).
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import type { PricesR2Config } from "./config";

/** Crea un client S3-compatible puntato a R2 dell'account configurato. */
export function createR2Client(r2: PricesR2Config): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: `https://${r2.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: r2.accessKeyId,
      secretAccessKey: r2.secretAccessKey,
    },
  });
}

/**
 * Scarica un'immagine da `sourceUrl` e la PUT su R2 con chiave deterministica
 * derivata dal symbol. Ritorna l'URL pubblico finale (su custom domain),
 * oppure `null` se R2 non è configurato. Throw su errori di rete/upload —
 * i caller devono gestire il fallback.
 */
export async function mirrorCoinImage(
  r2: PricesR2Config | null,
  symbol: string,
  sourceUrl: string,
): Promise<string | null> {
  if (!r2) return null;
  if (!sourceUrl) return null;

  const res = await fetch(sourceUrl, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(
      `[prices/storage] Source fetch failed for ${symbol}: HTTP ${res.status}`,
    );
  }
  const arrayBuf = await res.arrayBuffer();
  const body = Buffer.from(arrayBuf);

  // Determine extension + content-type. CoinGecko serve quasi sempre PNG;
  // alcuni coin hanno JPG. WebP tipicamente no. Sniffiamo dal Content-Type
  // della response, fallback a PNG (estensione standard di CoinGecko).
  const contentType = res.headers.get("content-type") ?? "image/png";
  const ext = contentTypeToExt(contentType);

  const key = coinImageKey(symbol, ext);
  const client = createR2Client(r2);

  await client.send(
    new PutObjectCommand({
      Bucket: r2.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      // Cache aggressiva: il file è immutabile per design (cambio coin =
      // sovrascrittura della stessa key, browser/CDN ricaricano dopo
      // invalidazione manuale). 1 anno con immutable.
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );

  return `${r2.publicBaseUrl}/${key}`;
}

/**
 * Cancella la coin image da R2 (chiamato da deleteCoinAction).
 * Errori loggati ma non rilanciati: la cancellazione DB è prioritaria.
 */
export async function deleteCoinImage(
  r2: PricesR2Config | null,
  symbol: string,
  storedUrl: string | null,
): Promise<void> {
  if (!r2 || !storedUrl) return;
  // Cancella solo se l'URL salvato punta al nostro bucket (non a CoinGecko)
  if (!storedUrl.startsWith(r2.publicBaseUrl + "/")) return;

  const key = storedUrl.slice(r2.publicBaseUrl.length + 1);
  if (!key) return;

  try {
    const client = createR2Client(r2);
    await client.send(
      new DeleteObjectCommand({ Bucket: r2.bucket, Key: key }),
    );
  } catch (err) {
    console.error(`[prices/storage] R2 delete failed for ${symbol}:`, err);
  }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function coinImageKey(symbol: string, ext: string): string {
  // Symbol normalizzato lowercase. Niente prefisso "coins/" perché il bucket
  // è già dedicato (`coins`) — un prefix duplicherebbe il concetto.
  return `${symbol.toLowerCase()}.${ext}`;
}

function contentTypeToExt(contentType: string): string {
  const t = contentType.toLowerCase().split(";")[0]?.trim() ?? "";
  if (t === "image/png")  return "png";
  if (t === "image/jpeg") return "jpg";
  if (t === "image/webp") return "webp";
  if (t === "image/svg+xml") return "svg";
  if (t === "image/gif") return "gif";
  return "png"; // fallback conservativo
}
