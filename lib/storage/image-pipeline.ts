// lib/storage/image-pipeline.ts
//
// Pipeline immagini PURA: prende un buffer, ritorna N varianti webp.
// Zero conoscenza di storage backend, zero DB, zero side-effect HTTP.
// Riusabile da qualsiasi modulo che debba processare immagini server-
// side (posts media, news hero, in futuro avatars / cms media).
//
// Sharp `.rotate()` SENZA argomenti applica EXIF orientation alla
// matrice di pixel e poi rimuove i tag EXIF dall'output — la privacy
// nota GPS sparisce by-default. webp() inoltre non riemette EXIF.
//
// Reentrancy: `pipeline.clone()` per ogni variante è essenziale —
// senza, il primo `.resize().webp().toBuffer()` consumerebbe la
// pipeline e i clone successivi fallirebbero.
import "server-only";

import sharp from "sharp";

export interface VariantSpec {
  /** Nome logico della variante (es. "hero", "card", "thumb"). */
  name: string;
  /** Lato massimo (lato lungo) in pixel. L'aspect ratio è preservato
   *  via `fit: "inside"` + `withoutEnlargement: true`. */
  maxSide: number;
  /** Quality webp (1-100). Standard: 70-85 a seconda dell'uso. */
  quality: number;
}

export interface ProcessedVariant {
  name: string;
  buffer: Buffer;
  width: number;
  height: number;
  sizeBytes: number;
  /** Sempre "image/webp" per ora. Esposto come campo separato per
   *  future varianti (avif, ad esempio). */
  mimeType: "image/webp";
}

/**
 * Processa un buffer immagine in N varianti webp. Throw se sharp
 * non riesce a decodificare l'input (`failOn: "error"`).
 *
 * Performance: ~200-500ms per variante a 2048px su CPU server,
 * lineare nel numero di varianti. Per N=3 conta ~1-1.5s totale.
 */
export async function processImageToWebpVariants(
  raw: Buffer,
  variants: readonly VariantSpec[],
): Promise<ProcessedVariant[]> {
  const pipeline = sharp(raw, { failOn: "error" }).rotate();

  // Eseguiamo in parallelo: sharp è async-friendly su libuv thread pool,
  // e i clone sono indipendenti.
  return Promise.all(
    variants.map(async (spec) => {
      const out = await pipeline
        .clone()
        .resize({
          width: spec.maxSide,
          height: spec.maxSide,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: spec.quality })
        .toBuffer({ resolveWithObject: true });
      return {
        name: spec.name,
        buffer: out.data,
        width: out.info.width ?? 0,
        height: out.info.height ?? 0,
        sizeBytes: out.data.byteLength,
        mimeType: "image/webp" as const,
      };
    }),
  );
}
