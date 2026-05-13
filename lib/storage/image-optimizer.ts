/**
 * Image optimizer — switch tra Vercel Image Optimization (default) e
 * Supabase Image Transformations.
 *
 * Vercel: passi l'URL originale a `next/image`, Vercel scarica e ottimizza
 *   on-demand. Free su Hobby (1000 source img/mese), 5000 su Pro.
 *
 * Supabase: costruiamo l'URL con query string `?width=...&quality=...`
 *   che il CDN Supabase trasforma. Richiede piano Pro+ con feature attiva.
 *
 * Switch: env var `IMAGE_OPTIMIZER=vercel|supabase`. Default vercel.
 *
 * Per `<img>` raw (es. nel body CMS rich-text iniettato via
 * dangerouslySetInnerHTML, dove non possiamo usare il React component
 * <Image>) usa `buildOptimizedImageUrl()` che genera l'URL ottimizzato
 * direttamente, indipendentemente dal componente.
 */

import type { ImagePreset } from "./image-widths";

export type OptimizerMode = "vercel" | "supabase";

export function getOptimizerMode(): OptimizerMode {
  const v = process.env.IMAGE_OPTIMIZER;
  return v === "supabase" ? "supabase" : "vercel";
}

export interface OptimizedImageProps {
  /** URL finale da passare a `<img>` o `<Image>`. */
  src: string;
  /** Quando true, Next non riprocessa (usato in modalità Supabase). */
  unoptimized: boolean;
}

/**
 * Ritorna le props ottimali per renderizzare un asset di media library.
 * In modalità Vercel: src originale, lascia fare a Next/Vercel.
 * In modalità Supabase: appendi i query params transforms; setta
 * `unoptimized` per evitare doppia ottimizzazione.
 */
export function getOptimizedImageProps(
  publicUrl: string,
  opts: { width?: number; quality?: number } = {},
): OptimizedImageProps {
  const mode = getOptimizerMode();

  if (mode === "supabase") {
    const params = new URLSearchParams();
    if (opts.width) params.set("width", String(opts.width));
    if (opts.quality) params.set("quality", String(opts.quality));
    const sep = publicUrl.includes("?") ? "&" : "?";
    return {
      src: params.toString() ? `${publicUrl}${sep}${params.toString()}` : publicUrl,
      unoptimized: true,
    };
  }

  return { src: publicUrl, unoptimized: false };
}

/**
 * Costruisce l'URL ottimizzato adatto a un `<img>` raw (no Next/Image).
 *
 * Vercel: ritorna `/_next/image?url=...&w=...&q=...`. È l'endpoint
 *   pubblico che Vercel espone — lo stesso che `<Image>` usa internamente.
 *   Funziona ovunque, scarica on-demand l'originale dal bucket Supabase
 *   e cacha la variante sul CDN edge.
 *
 * Supabase: appendi `?width=...&quality=...` all'URL del bucket — il
 *   CDN Supabase trasforma in-flight. Stesso comportamento di
 *   getOptimizedImageProps modalità "supabase".
 *
 * Caller responsibility: passare un URL whitelisted in
 * `next.config.images.remotePatterns`. Per URL non whitelisted, Vercel
 * ritornerà 400 e l'immagine non si caricherà.
 */
export function buildOptimizedImageUrl(
  publicUrl: string,
  width: number,
  quality = 75,
): string {
  // SVG bypass: Next image optimizer rifiuta gli SVG (default
  // `dangerouslyAllowSVG: false`, per security) e l'errore esplode il
  // TransformStream RSC ("controller[kState].transformAlgorithm is not a
  // function"), cascando in tutto il render. Gli SVG sono già responsive
  // per natura, quindi optimization è no-op: ritorniamo l'URL raw e il
  // tag `<img>` lo carica direttamente.
  // Anche Supabase mode lo benefit: il transform Supabase su SVG fa
  // raster output (PNG) che è semanticamente sbagliato per un logo SVG.
  if (publicUrl.toLowerCase().includes(".svg")) {
    return publicUrl;
  }

  const mode = getOptimizerMode();

  if (mode === "supabase") {
    const params = new URLSearchParams();
    params.set("width", String(width));
    params.set("quality", String(quality));
    const sep = publicUrl.includes("?") ? "&" : "?";
    return `${publicUrl}${sep}${params.toString()}`;
  }

  // Vercel: route `/_next/image` (lo stesso usato internamente da Next/Image).
  const params = new URLSearchParams();
  params.set("url", publicUrl);
  params.set("w", String(width));
  params.set("q", String(quality));
  return `/_next/image?${params.toString()}`;
}

/**
 * Costruisce src + srcset + sizes per un `<img>` raw a partire da un preset.
 * Ritorna un oggetto pronto per essere spread sui props del tag.
 */
export function buildOptimizedImageAttrs(
  publicUrl: string,
  preset: ImagePreset,
): { src: string; srcSet: string; sizes: string } {
  const src = buildOptimizedImageUrl(publicUrl, preset.default, preset.quality);
  const srcSet = preset.srcset
    .map((w) => `${buildOptimizedImageUrl(publicUrl, w, preset.quality)} ${w}w`)
    .join(", ");
  return { src, srcSet, sizes: preset.sizes };
}
