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
 */

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
