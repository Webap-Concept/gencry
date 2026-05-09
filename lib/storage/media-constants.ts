// Sorgente unica per limiti e mime accettati. Importato sia client-side
// (uploader/picker per pre-check + hint) sia server-side (lib/storage/media.ts
// + actions per enforcement). File client-safe: NON aggiungere "server-only".
//
// Il bucket Supabase ha il suo limite (default 50MB) ma noi enforce
// MEDIA_MAX_BYTES applicativi: tagliamo banda + tempo di upload prima del PUT.

export const MEDIA_MAX_MB_HINT = 16;
export const MEDIA_MAX_BYTES = MEDIA_MAX_MB_HINT * 1024 * 1024;

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

export const MEDIA_ALLOWED_MIMES_HINT = "JPG, PNG, WebP, GIF, SVG, PDF, MP4, WebM";

export function isAllowedMime(mime: string): mime is MediaMime {
  return (MEDIA_ALLOWED_MIMES as readonly string[]).includes(mime);
}
