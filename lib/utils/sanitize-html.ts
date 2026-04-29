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
    ],
    allowedAttributes: {
      a: ["href", "title", "target", "rel"],
      img: ["src", "alt", "title", "width", "height"],
      "*": ["style"],
    },
    allowedStyles: {
      "*": {
        "text-align": [/^(left|right|center|justify)$/],
      },
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: { img: ["http", "https", "data"] },
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer" }),
    },
  });
}
