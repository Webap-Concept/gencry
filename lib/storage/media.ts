// lib/storage/media.ts
//
// Storage layer della media library del CMS — backed by Cloudflare R2.
// Vedi lib/storage/r2-media.ts per i building block S3-compatible.
//
// Flow upload (3 step, server↔client):
//
//   1. server: `createMediaUploadTicket` valida e genera storage key + URL
//      presigned PUT (5 min TTL). La caller INSERT-a una riga draft
//      (confirmed_at=NULL) e ritorna il ticket al client.
//
//   2. client: PUT diretto al `uploadUrl` con il file. Niente service-role
//      lato browser — il presigned URL è scoped a UNA singola key per 5 min.
//
//   3. server: `verifyAndConfirmMedia` fa HeadObject per accertare il file,
//      sanitizza gli SVG in-place (download → sanitize-html → re-upload),
//      e ritorna l'URL pubblico al chiamante (la riga DB viene confermata
//      dalla server action chiamante).
//
// Cleanup orphan: cron `media-orphan-cleanup` (vedi
// `deleteUnconfirmedAssets` in lib/db/media-queries.ts) cancella draft
// >24h non confermate. Per gli asset orphan su R2 (file caricato ma
// confirm mai chiamato) servirà un cleanup separato — TODO post v1.

import "server-only";

import { randomUUID } from "node:crypto";
import sanitizeHtml from "sanitize-html";
import {
  buildMediaPublicUrl,
  createMediaPresignedPut,
  deleteMediaObject,
  getMediaObjectAsText,
  headMediaObject,
  loadMediaR2Config,
  putMediaObject,
  type MediaR2Config,
} from "./r2-media";
import type { MediaMime } from "./media-constants";

export {
  MEDIA_MAX_BYTES,
  MEDIA_MAX_MB_HINT,
  MEDIA_ALLOWED_MIMES,
  MEDIA_ALLOWED_MIMES_HINT,
  isAllowedMime,
  type MediaMime,
} from "./media-constants";

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

// ---------------------------------------------------------------------------
// SVG sanitization — riusata sia all'upload (in-place) sia all'occorrenza.
// ---------------------------------------------------------------------------

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
    allowedSchemesByTag: {},
    allowedSchemes: ["http", "https", "data"],
    disallowedTagsMode: "discard",
  });
}

// ---------------------------------------------------------------------------
// Config helper — un wrapper privato per non ripetere il throw esplicito.
// ---------------------------------------------------------------------------

async function loadR2OrThrow(): Promise<MediaR2Config> {
  const cfg = await loadMediaR2Config();
  if (!cfg) {
    throw new Error(
      "[media] R2 media library non configurata. Completa /admin/services/cloudflare → R2 storage (media library).",
    );
  }
  return cfg;
}

// ---------------------------------------------------------------------------
// Ticket-based upload (presigned PUT)
// ---------------------------------------------------------------------------

export interface MediaUploadTicket {
  /** Key R2 (path nel bucket). Anche `media_assets.storage_path` salva
   *  questo valore — folder/<uuid>.<ext> oppure root/<uuid>.<ext>. */
  storagePath: string;
  /** Public URL deterministica (`<publicBaseUrl>/<storagePath>`). Salvabile
   *  subito nella draft DB; sarà raggiungibile non appena il PUT completa. */
  publicUrl: string;
  /** Presigned PUT URL (R2 → S3-compatible). Il client fa fetch/XHR PUT qui. */
  uploadUrl: string;
  /** Header che il client DEVE applicare al PUT — devono matchare il sign. */
  uploadHeaders: Record<string, string>;
  /** ContentType atteso (echo per il client). */
  contentType: MediaMime;
  /** Epoch ms di scadenza del presigned URL (info-only, ~ 5 min dal mint). */
  expiresAt: number;
}

/**
 * Genera storage_path + presigned PUT per un upload. Caller (server action)
 * deve subito INSERT-are una riga draft in `media_assets` con questo path
 * e ritornare il ticket al client. Dopo il PUT del client, `confirmMediaUpload`
 * verifica e setta `confirmed_at`.
 */
export async function createMediaUploadTicket(opts: {
  mime: MediaMime;
  folderId: number | null;
  userId: string; // tenuto per audit/log, non usato nel signing R2
}): Promise<MediaUploadTicket> {
  const cfg = await loadR2OrThrow();

  const ext = extFromMime(opts.mime);
  const folderSegment = opts.folderId === null ? "root" : String(opts.folderId);
  const storagePath = `${folderSegment}/${randomUUID()}.${ext}`;

  const presigned = await createMediaPresignedPut({
    cfg,
    key: storagePath,
    contentType: opts.mime,
  });

  return {
    storagePath,
    publicUrl: buildMediaPublicUrl(cfg, storagePath),
    uploadUrl: presigned.uploadUrl,
    uploadHeaders: presigned.headers,
    contentType: opts.mime,
    expiresAt: presigned.expiresAt,
  };
}

/**
 * Verifica che il file sia presente nel bucket e ritorni l'URL pubblico.
 * Per gli SVG: download → sanitize → re-upload (upsert sulla stessa key)
 * — l'utente ha PUT-ato il file raw via presigned, qui togliamo script /
 * event handlers / foreignObject. Se la sanitization svuota il payload,
 * il file viene cancellato e la verifica fallisce.
 */
export async function verifyAndConfirmMedia(opts: {
  storagePath: string;
  mime: MediaMime;
}): Promise<{ ok: true; publicUrl: string } | { ok: false; error: string }> {
  const cfg = await loadR2OrThrow();

  // 1. HEAD — il file esiste?
  const head = await headMediaObject(cfg, opts.storagePath);
  if (!head) {
    return { ok: false, error: "object_not_found" };
  }

  // 2. SVG sanitization in-place. Mantiene la key invariata così la riga
  //    DB con storage_path già committata resta coerente.
  if (opts.mime === "image/svg+xml") {
    const raw = await getMediaObjectAsText(cfg, opts.storagePath);
    if (raw === null) {
      console.error("[media] svg download failed for", opts.storagePath);
      return { ok: false, error: "svg_download_failed" };
    }
    let cleaned: string;
    try {
      cleaned = sanitizeSvg(raw);
    } catch {
      await deleteMediaObject(cfg, opts.storagePath);
      return { ok: false, error: "svg_sanitize_failed" };
    }
    if (!cleaned.trim()) {
      await deleteMediaObject(cfg, opts.storagePath);
      return { ok: false, error: "svg_empty_after_sanitize" };
    }
    try {
      await putMediaObject({
        cfg,
        key: opts.storagePath,
        body: Buffer.from(cleaned, "utf8"),
        contentType: "image/svg+xml",
      });
    } catch (err) {
      console.error("[media] svg re-upload failed:", err);
      return { ok: false, error: "svg_resave_failed" };
    }
  }

  return { ok: true, publicUrl: buildMediaPublicUrl(cfg, opts.storagePath) };
}

/**
 * Rimuove un asset dal bucket. Best-effort: se l'oggetto non esiste, non
 * solleva (idempotente) — la responsabilità del DB rimane sul caller.
 */
export async function deleteMediaFile(storagePath: string): Promise<void> {
  const cfg = await loadMediaR2Config();
  if (!cfg) {
    // Se R2 non è configurato non c'è niente da cancellare. Logghiamo e
    // proseguiamo: il caller cancella comunque la riga DB.
    console.warn("[media] R2 not configured at delete time, skipping object removal:", storagePath);
    return;
  }
  await deleteMediaObject(cfg, storagePath);
}
