import "server-only";

import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import sanitizeHtml from "sanitize-html";
import { getStorageClient } from "./supabase";
import type { MediaMime } from "./media-constants";

export {
  MEDIA_MAX_BYTES,
  MEDIA_MAX_MB_HINT,
  MEDIA_ALLOWED_MIMES,
  MEDIA_ALLOWED_MIMES_HINT,
  isAllowedMime,
  type MediaMime,
} from "./media-constants";

const BUCKET = "media";

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

// ---------------------------------------------------------------------------
// JWT minting per upload TUS resumable
// ---------------------------------------------------------------------------

const JWT_TTL_SECONDS = 120; // 2 min: copre l'upload + un po' di buffer

let cachedJwtSecret: Uint8Array | null = null;
function getSupabaseJwtSecret(): Uint8Array {
  if (cachedJwtSecret) return cachedJwtSecret;
  const raw = process.env.SUPABASE_JWT_SECRET;
  if (!raw) {
    throw new Error(
      "[media] SUPABASE_JWT_SECRET non configurato (necessario per TUS upload).",
    );
  }
  cachedJwtSecret = new TextEncoder().encode(raw);
  return cachedJwtSecret;
}

/**
 * Minta un JWT firmato con SUPABASE_JWT_SECRET valido per il bucket Storage.
 * Format compatibile con `auth.uid() / auth.role()` di Supabase: la RLS
 * policy del bucket `media` (vedi migration 0039) accetta INSERT/UPDATE/SELECT
 * per `authenticated`. TTL stretto (2 min) limita il blast radius in caso
 * di intercept.
 *
 * `userId` è il nostro UUID admin (users.id). Va nel `sub` per audit;
 * la policy non lo verifica esplicitamente — l'autorizzazione vera è
 * lato app (la chiamata avviene solo dopo `requireAdminPage`).
 */
async function mintSupabaseUploadJwt(userId: string): Promise<string> {
  const secret = getSupabaseJwtSecret();
  return new SignJWT({
    sub: userId,
    aud: "authenticated",
    role: "authenticated",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${JWT_TTL_SECONDS}s`)
    .sign(secret);
}

// ---------------------------------------------------------------------------
// Ticket-based upload (TUS resumable)
// ---------------------------------------------------------------------------

export interface MediaUploadTicket {
  /** UUID-based path nel bucket (folder/<uuid>.<ext>) */
  storagePath: string;
  /** Public URL deterministica (Supabase getPublicUrl) — si può salvare
   *  subito sulla draft, sarà valida non appena il file esiste. */
  publicUrl: string;
  /** JWT short-lived per autorizzare il TUS upload. Spedito al client. */
  uploadToken: string;
  /** Endpoint TUS (Supabase /storage/v1/upload/resumable). Comodo passarlo
   *  qui invece di replicare la composizione URL nel client. */
  endpoint: string;
  /** Bucket fisso, ma esposto al client per `metadata.bucketName` di TUS. */
  bucketName: string;
  /** ContentType atteso. Il client lo passa in TUS metadata. */
  contentType: MediaMime;
}

/**
 * Genera path + JWT per un upload TUS. Il caller (server action) deve
 * subito INSERT-are una riga draft in `media_assets` con questo path
 * e ritornare il ticket al client. Il client poi fa l'upload diretto al
 * bucket via TUS, e infine richiama `confirmMediaUpload(assetId)` che
 * verifica + setta `confirmed_at`.
 */
export async function createMediaUploadTicket(opts: {
  mime: MediaMime;
  folderId: number | null;
  userId: string;
}): Promise<MediaUploadTicket> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error("[media] NEXT_PUBLIC_SUPABASE_URL non configurato.");
  }

  const ext = extFromMime(opts.mime);
  const folderSegment = opts.folderId === null ? "root" : String(opts.folderId);
  const storagePath = `${folderSegment}/${randomUUID()}.${ext}`;

  const uploadToken = await mintSupabaseUploadJwt(opts.userId);
  // getPublicUrl è sync e deterministico — possiamo salvare la URL nella
  // draft e ritornarla al client. Sarà raggiungibile non appena il file
  // esiste fisicamente nel bucket.
  const supabase = getStorageClient();
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);

  return {
    storagePath,
    publicUrl: data.publicUrl,
    uploadToken,
    endpoint: `${supabaseUrl.replace(/\/$/, "")}/storage/v1/upload/resumable`,
    bucketName: BUCKET,
    contentType: opts.mime,
  };
}

/**
 * Verifica che il file sia presente nel bucket allo storagePath atteso e
 * ritorni un publicUrl valido. Per gli SVG, scarica il contenuto, lo
 * sanitizza e lo ri-upload in place (overwrite) prima di confermare —
 * l'utente ha PUT-ato il file raw via TUS, ma noi vogliamo SVG sanitizzato
 * server-side (rimozione script, event handlers, foreignObject). Se la
 * sanitization svuota il payload, il file viene cancellato e la verifica
 * fallisce.
 */
export async function verifyAndConfirmMedia(opts: {
  storagePath: string;
  mime: MediaMime;
}): Promise<{ ok: true; publicUrl: string } | { ok: false; error: string }> {
  const supabase = getStorageClient();

  // 1. HEAD: verifichiamo l'esistenza del file (TUS ha confermato lato client
  //    ma noi siamo l'autorità). `list` con prefix esatto è il path supportato
  //    da supabase-js v2 per check-existence.
  const lastSlash = opts.storagePath.lastIndexOf("/");
  const folder = lastSlash >= 0 ? opts.storagePath.slice(0, lastSlash) : "";
  const filename = lastSlash >= 0
    ? opts.storagePath.slice(lastSlash + 1)
    : opts.storagePath;

  const { data: list, error: listErr } = await supabase.storage
    .from(BUCKET)
    .list(folder, { search: filename, limit: 1 });
  if (listErr || !list || list.length === 0) {
    if (listErr) {
      console.error("[media] verify list failed:", listErr.message);
    }
    return { ok: false, error: "object_not_found" };
  }

  // 2. SVG sanitization in-place (download → clean → re-upload). Mantiene
  //    il path invariato così la riga DB con storage_path già committata
  //    resta coerente.
  if (opts.mime === "image/svg+xml") {
    const { data: dl, error: dlErr } = await supabase.storage
      .from(BUCKET)
      .download(opts.storagePath);
    if (dlErr || !dl) {
      console.error("[media] svg download failed:", dlErr?.message);
      return { ok: false, error: "svg_download_failed" };
    }
    let cleaned: string;
    try {
      cleaned = sanitizeSvg(await dl.text());
    } catch {
      await supabase.storage.from(BUCKET).remove([opts.storagePath]);
      return { ok: false, error: "svg_sanitize_failed" };
    }
    if (!cleaned.trim()) {
      await supabase.storage.from(BUCKET).remove([opts.storagePath]);
      return { ok: false, error: "svg_empty_after_sanitize" };
    }
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(opts.storagePath, Buffer.from(cleaned, "utf8"), {
        contentType: "image/svg+xml",
        upsert: true,
      });
    if (upErr) {
      console.error("[media] svg re-upload failed:", upErr.message);
      return { ok: false, error: "svg_resave_failed" };
    }
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(opts.storagePath);
  return { ok: true, publicUrl: data.publicUrl };
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
