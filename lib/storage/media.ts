import "server-only";

import { randomUUID } from "node:crypto";
import sanitizeHtml from "sanitize-html";
import { getStorageClient } from "./supabase";

const BUCKET = "media";

export const MEDIA_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export const MEDIA_ALLOWED_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/svg+xml",
  "application/pdf",
  "video/mp4",
  "video/webm",
] as const;

export type MediaMime = (typeof MEDIA_ALLOWED_MIMES)[number];

export function isAllowedMime(mime: string): mime is MediaMime {
  return (MEDIA_ALLOWED_MIMES as readonly string[]).includes(mime);
}

const EXT_BY_MIME: Record<MediaMime, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "application/pdf": "pdf",
  "video/mp4": "mp4",
  "video/webm": "webm",
};

function extFromMime(mime: MediaMime): string {
  return EXT_BY_MIME[mime];
}

/**
 * Sanitizza un SVG rimuovendo script, event handlers, foreignObject e
 * qualunque tag/attributo non whitelisted. Fallback safe: in caso di parser
 * error, rifiuta il file.
 */
function sanitizeSvg(raw: string): string {
  return sanitizeHtml(raw, {
    allowedTags: [
      "svg", "g", "path", "circle", "rect", "ellipse", "line", "polyline",
      "polygon", "text", "tspan", "defs", "linearGradient", "radialGradient",
      "stop", "filter", "feGaussianBlur", "feOffset", "feMerge", "feMergeNode",
      "feColorMatrix", "feFlood", "feComposite", "use", "symbol", "title",
      "desc", "clipPath", "mask", "pattern", "marker",
    ],
    allowedAttributes: false as unknown as Record<string, string[]>,
    // Disabilita tutti gli URI schemes pericolosi
    allowedSchemesByTag: {},
    allowedSchemes: ["http", "https", "data"],
    disallowedTagsMode: "discard",
  });
}

export interface UploadedMedia {
  storagePath: string;
  publicUrl: string;
  filename: string;
  mime: MediaMime;
  sizeBytes: number;
}

/**
 * Carica un file nel bucket "media". Path: {folderId|"root"}/{uuid}.{ext}.
 * Per gli SVG sanitizza il contenuto prima di salvarlo. Ritorna metadata
 * pronti per l'insert in `media_assets`.
 */
export async function uploadMediaFile(opts: {
  buffer: Buffer;
  mime: string;
  originalFilename: string;
  folderId: number | null;
}): Promise<{ ok: true; data: UploadedMedia } | { ok: false; error: string }> {
  if (!isAllowedMime(opts.mime)) {
    return { ok: false, error: "mime_not_allowed" };
  }
  if (opts.buffer.byteLength > MEDIA_MAX_BYTES) {
    return { ok: false, error: "file_too_large" };
  }

  let payload: Buffer = opts.buffer;
  if (opts.mime === "image/svg+xml") {
    try {
      const cleaned = sanitizeSvg(opts.buffer.toString("utf8"));
      if (!cleaned.trim()) {
        return { ok: false, error: "svg_empty_after_sanitize" };
      }
      payload = Buffer.from(cleaned, "utf8");
    } catch {
      return { ok: false, error: "svg_sanitize_failed" };
    }
  }

  const ext = extFromMime(opts.mime as MediaMime);
  const uuid = randomUUID();
  const folderSegment = opts.folderId === null ? "root" : String(opts.folderId);
  const storagePath = `${folderSegment}/${uuid}.${ext}`;

  const supabase = getStorageClient();
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, payload, {
      contentType: opts.mime,
      upsert: false,
    });

  if (error) {
    console.error("[media] upload failed:", error.message);
    return { ok: false, error: "storage_upload_failed" };
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);

  return {
    ok: true,
    data: {
      storagePath,
      publicUrl: data.publicUrl,
      filename: opts.originalFilename,
      mime: opts.mime as MediaMime,
      sizeBytes: opts.buffer.byteLength,
    },
  };
}

/**
 * Rimuove un asset dal bucket. Best-effort: se l'oggetto non esiste, non
 * solleva (idempotente) — la responsabilità del DB rimane sul caller.
 */
export async function deleteMediaFile(storagePath: string): Promise<void> {
  const supabase = getStorageClient();
  const { error } = await supabase.storage.from(BUCKET).remove([storagePath]);
  if (error) {
    console.error("[media] delete failed:", error.message);
  }
}
