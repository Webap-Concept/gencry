import "server-only";
import sanitizeHtml from "sanitize-html";

/**
 * Sanitizza HTML prodotto dall'editor rich-text (Tiptap) prima di renderizzarlo
 * con dangerouslySetInnerHTML. Da invocare lato server.
 *
 * Whitelist allineata alle estensioni Tiptap usate dall'editor:
 *   starter-kit (h, p, list, blockquote, code, pre, strong, em, ...) +
 *   link + text-align + underline.
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
      img: ["src", "alt", "title", "width", "height", "loading", "decoding"],
      figure: ["class", "data-align", "data-zoom", "style"],
      figcaption: ["class"],
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
      // Native lazy-loading + async decode su tutte le immagini CMS
      // — niente Next/Image (vedi commento storico, dangerouslySetInnerHTML
      // non può iniettare React component). Performance accettabile per
      // CMS pages a basso traffico.
      img: sanitizeHtml.simpleTransform("img", {
        loading: "lazy",
        decoding: "async",
      }),
    },
  });
}
