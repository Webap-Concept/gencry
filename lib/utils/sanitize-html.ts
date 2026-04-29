import "server-only";
import DOMPurify from "isomorphic-dompurify";

/**
 * Sanitizza HTML prodotto dall'editor rich-text (Tiptap) prima di renderizzarlo
 * con dangerouslySetInnerHTML. Da invocare lato server.
 *
 * Rimuove <script>, gli attributi on*, le URL javascript: e tutto ciò che non
 * appartiene al sottoinsieme HTML che usiamo nei contenuti delle pagine.
 */
export function sanitizeRichTextHtml(html: string | null | undefined): string {
  if (!html) return "";
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["style", "script", "iframe", "object", "embed", "form"],
    FORBID_ATTR: ["style", "onerror", "onload", "onclick", "onmouseover"],
  });
}
