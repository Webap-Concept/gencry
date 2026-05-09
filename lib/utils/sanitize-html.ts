import "server-only";
import sanitizeHtml from "sanitize-html";
import { buildOptimizedImageAttrs } from "@/lib/storage/image-optimizer";
import { IMAGE_PRESETS } from "@/lib/storage/image-widths";

/**
 * URL del bucket Supabase rispetto a cui consideriamo l'immagine "nostra"
 * e quindi candidata all'ottimizzazione via /_next/image. URL esterni
 * (Tiptap paste da web, ecc.) li lasciamo intatti.
 */
function isOptimizableUrl(src: string): boolean {
  return /^https:\/\/[^/]+\.supabase\.co\/storage\/v1\/object\/public\//.test(
    src,
  );
}

/**
 * Sanitizza HTML prodotto dall'editor rich-text (Tiptap) prima di renderizzarlo
 * con dangerouslySetInnerHTML. Da invocare lato server.
 *
 * Whitelist allineata alle estensioni Tiptap usate dall'editor:
 *   starter-kit (h, p, list, blockquote, code, pre, strong, em, ...) +
 *   link + text-align + underline.
 *
 * Oltre alla sanitization, il transform `img` riscrive `src` + aggiunge
 * `srcset`/`sizes` per servire varianti ottimizzate via /_next/image
 * (Vercel) o ?width= (Supabase). L'URL originale è preservato in
 * `data-src-full` per il lightbox (vedi cms-figure-lightbox.tsx).
 *
 * Niente jsdom: sanitize-html è pure-JS e gira anche in serverless.
 */
export function sanitizeRichTextHtml(html: string | null | undefined): string {
  if (!html) return "";
  return sanitizeHtml(html, {
    allowedTags: [
      "p",
      "br",
      "hr",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "ul",
      "ol",
      "li",
      "blockquote",
      "pre",
      "code",
      "strong",
      "em",
      "b",
      "i",
      "u",
      "s",
      "a",
      "img",
      "span",
      "figure",
      "figcaption",
    ],
    allowedAttributes: {
      a: ["href", "title", "target", "rel"],
      img: [
        "src",
        "srcset",
        "sizes",
        "alt",
        "title",
        "width",
        "height",
        "loading",
        "decoding",
        "data-src-full",
      ],
      figure: ["class", "data-align", "data-zoom", "style"],
      figcaption: ["class"],
      // 4 stili visuali: default/card/pull/quoted (vedi blockquote-styled.ts +
      // frontend.css). Niente altri attributi: non vogliamo class arbitrarie
      // o style inline su blockquote, gli stili vengono dal solo data-style.
      blockquote: ["data-style"],
      "*": ["style"],
    },
    allowedClasses: {
      figure: ["cms-figure"],
    },
    allowedStyles: {
      "*": {
        "text-align": [/^(left|right|center|justify)$/],
      },
      figure: {
        // Solo width in percentuale: 0-100% con max 1 decimal. Niente
        // pixel/em arbitrari (vettore di abuso layout — un admin
        // malizioso potrebbe spararsi width:99999px).
        width: [/^\d{1,3}(?:\.\d)?%$/],
      },
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: { img: ["http", "https", "data"] },
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer" }),
      // Riscrive `src` + aggiunge `srcset`/`sizes` ottimizzati per il body
      // CMS. Il browser sceglie la variante in base al viewport invece di
      // scaricare l'originale (potenzialmente 16MB) → savings drammatici
      // sul TTFB delle pagine articolo. URL non-Supabase passano intatti.
      // L'originale è preservato in `data-src-full` per il lightbox: il
      // click-to-zoom carica una versione 1920w invece della 1024w del
      // render iniziale.
      img: (_tagName, attribs) => {
        const src = attribs.src ?? "";
        const baseAttrs = {
          ...attribs,
          loading: "lazy",
          decoding: "async",
        };
        if (!src || !isOptimizableUrl(src)) {
          return { tagName: "img", attribs: baseAttrs };
        }
        const optimized = buildOptimizedImageAttrs(src, IMAGE_PRESETS.cmsBody);
        return {
          tagName: "img",
          attribs: {
            ...baseAttrs,
            src: optimized.src,
            srcset: optimized.srcSet,
            sizes: optimized.sizes,
            "data-src-full": src,
          },
        };
      },
    },
  });
}
