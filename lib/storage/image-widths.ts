/**
 * Configurazione centralizzata dei width preset per l'ottimizzazione immagini.
 *
 * I preset sono dimensionati sui layout effettivi (max-width container),
 * non sui device sizes generici di Next. Aggiungere un nuovo preset solo
 * quando un layout introduce un container width diverso dai casi qui sotto;
 * altrimenti riusare uno dei preset esistenti.
 *
 * `srcset`: lista di width usate per generare il srcset multi-resolution.
 * `default`: il width usato come `src` (fallback browser senza srcset support).
 * `quality`: qualità transcode (Vercel default 75 — abbassare con cautela).
 * `sizes`: hint al browser su quale width servire dato il viewport.
 *
 * Esempio: per il body articolo container è 720px → 720 retina = 1440 max,
 * 360 retina (mobile) = 720, sotto 360 il browser non scarica più.
 *
 * Tradeoff: srcset più larga = più varianti generate (Vercel cacha tutte
 * dopo la prima request, ma ogni source counts contro la quota mensile).
 */

export interface ImagePreset {
  /** Widths usate nel srcset (px). */
  srcset: readonly number[];
  /** Width usata come `src` (fallback). */
  default: number;
  /** Quality transcode (1-100). */
  quality: number;
  /** `sizes` attribute per il browser. */
  sizes: string;
}

export const IMAGE_PRESETS = {
  /** Hero cover full-bleed (TemplateArticolo + TemplateBlog) — il container
   *  è 100% viewport, fuori dal main centrato. Serve fino a 1920 per laptop
   *  full screen retina. Sotto i 640 il browser scaglia il 640w upscale. */
  cmsHero: {
    srcset: [640, 1024, 1440, 1920],
    default: 1440,
    quality: 75,
    sizes: "100vw",
  },
  /** Immagine inline nel body rich-text. Stesso container 720px ma può
   *  avere `width: 25/33/50/75/100%` — il `sizes` qui è approssimato per
   *  il caso 100%; gli altri casi sono ammortizzati dalle varianti più
   *  piccole del srcset. */
  cmsBody: {
    srcset: [360, 640, 1024, 1440],
    default: 1024,
    quality: 75,
    sizes: "(max-width: 768px) 100vw, 720px",
  },
  /** Lightbox del rich-text (zoom click). Vuole più risoluzione: copre
   *  laptop full screen + 4K retina. */
  cmsLightbox: {
    srcset: [1024, 1920],
    default: 1920,
    quality: 80,
    sizes: "100vw",
  },
  /** Logo del sito nell'header (es. TemplateLegals). Height fissa ~32px,
   *  widths piccoli per retina. */
  cmsLogo: {
    srcset: [64, 128],
    default: 128,
    quality: 80,
    sizes: "128px",
  },
  /** Thumb nella libreria admin (MediaGrid + MediaPicker). Container ~200px,
   *  retina = 400px. Una sola variante: low traffic, no responsive. */
  adminThumb: {
    srcset: [400],
    default: 400,
    quality: 75,
    sizes: "200px",
  },
  /** Preview field nell'editor pagina. Container max ~160px altezza fissa,
   *  width auto. Una sola variante. */
  adminPreview: {
    srcset: [320, 640],
    default: 320,
    quality: 75,
    sizes: "160px",
  },
} as const satisfies Record<string, ImagePreset>;

export type ImagePresetKey = keyof typeof IMAGE_PRESETS;
