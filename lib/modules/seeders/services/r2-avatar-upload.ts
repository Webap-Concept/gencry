// lib/modules/seeders/services/r2-avatar-upload.ts
//
// Helper di upload avatar nello stesso bucket R2 degli avatar utente
// reali. Riuso `loadAvatarR2Config` + `createAvatarR2Client` da
// `lib/storage/r2-avatars.ts` (core), ma non passiamo per
// `uploadAvatarToR2` perche':
//   1) il bucket avatar reale accetta solo png/jpeg/webp (whitelist
//      core), mentre noi vogliamo uploadare anche SVG (initials +
//      DiceBear);
//   2) il modulo seeders deve avere isolamento — qui c'e' la sua
//      versione specializzata della stessa operazione.
//
// Pattern:
//   - uploadFromUrl(userId, sourceUrl)  → scarica + upload + URL pubblica
//   - uploadSvg(userId, svg)            → buffer SVG + upload + URL
//
// Entrambe ritornano `null` su fallimento (config mancante, R2 down,
// timeout, MIME non supportato). Il caller cade su fallback DiceBear
// URL diretto.
import "server-only";

import { PutObjectCommand } from "@aws-sdk/client-s3";
import {
  createAvatarR2Client,
  loadAvatarR2Config,
} from "@/lib/storage/r2-avatars";

const FETCH_TIMEOUT_MS = 15_000;
const MAX_BYTES = 4 * 1024 * 1024;

/**
 * MIME → extension. Esteso a SVG rispetto al core uploadAvatarToR2,
 * perche' il seeder uploada anche initials/DiceBear SVG.
 */
function extFromMime(mime: string): "png" | "jpg" | "webp" | "svg" | null {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/svg+xml") return "svg";
  return null;
}

/**
 * Browser UA: alcuni servizi (TPDNE) bloccano gli UA Node default.
 * Lo passiamo anche a DiceBear per coerenza (DiceBear non discrimina ma
 * il request log sembra piu' "normale").
 */
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * Scarica `sourceUrl`, valida MIME + size, uploada su R2 con key
 * `seed-<userId>.<ext>`. Il prefix `seed-` permette al cleanup di
 * cancellare solo i seed avatar (e non quelli utente reale) tramite
 * SCAN del bucket — futura ottimizzazione.
 *
 * Ritorna l'URL pubblica con cache-bust, o `null` se qualcosa fallisce.
 */
export async function uploadAvatarFromUrl(
  userId: string,
  sourceUrl: string,
): Promise<string | null> {
  const cfg = await loadAvatarR2Config();
  if (!cfg) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(sourceUrl, {
      headers: { "User-Agent": BROWSER_UA },
      signal: controller.signal,
      redirect: "follow",
    });
    if (!res.ok) {
      console.warn(`[seeders/r2-upload] source fetch ${res.status} for ${sourceUrl}`);
      return null;
    }
    const rawMime = res.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
    const ext = extFromMime(rawMime);
    if (!ext) {
      console.warn(`[seeders/r2-upload] unsupported mime '${rawMime}' from ${sourceUrl}`);
      return null;
    }
    const len = Number.parseInt(res.headers.get("content-length") ?? "0", 10);
    if (Number.isFinite(len) && len > MAX_BYTES) {
      console.warn(`[seeders/r2-upload] source too large (${len} bytes) from ${sourceUrl}`);
      return null;
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength > MAX_BYTES) return null;

    const key = `seed-${userId}.${ext}`;
    const client = createAvatarR2Client(cfg);
    await client.send(
      new PutObjectCommand({
        Bucket: cfg.bucket,
        Key: key,
        Body: buffer,
        ContentType: rawMime,
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
    return `${cfg.publicBaseUrl}/${key}?v=${Date.now()}`;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      console.warn(`[seeders/r2-upload] timeout fetching ${sourceUrl}`);
    } else {
      console.warn("[seeders/r2-upload] uploadAvatarFromUrl failed:", err);
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Uploada un Buffer (bytes gia' scaricati) sull'R2. Usato dall'AI face
 * path: il caller scarica TPDNE/Unsplash con dedup hash, poi passa i
 * bytes qui per upload. Risparmia un round-trip extra rispetto a
 * uploadAvatarFromUrl (che farebbe di nuovo fetch).
 */
export async function uploadAvatarBytes(
  userId: string,
  buffer: Buffer,
  mime: string,
): Promise<string | null> {
  const cfg = await loadAvatarR2Config();
  if (!cfg) return null;

  const ext = extFromMime(mime);
  if (!ext) {
    console.warn(`[seeders/r2-upload] unsupported mime '${mime}' for bytes upload`);
    return null;
  }
  if (buffer.byteLength > MAX_BYTES) return null;

  try {
    const key = `seed-${userId}.${ext}`;
    const client = createAvatarR2Client(cfg);
    await client.send(
      new PutObjectCommand({
        Bucket: cfg.bucket,
        Key: key,
        Body: buffer,
        ContentType: mime,
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
    return `${cfg.publicBaseUrl}/${key}?v=${Date.now()}`;
  } catch (err) {
    console.warn("[seeders/r2-upload] uploadAvatarBytes failed:", err);
    return null;
  }
}

/**
 * Uploada un SVG generato in-process (initials avatar) sullo stesso
 * bucket. Stesso prefix `seed-<userId>.svg`. Ritorna URL pubblica con
 * cache-bust.
 */
export async function uploadAvatarSvg(
  userId: string,
  svg: string,
): Promise<string | null> {
  const cfg = await loadAvatarR2Config();
  if (!cfg) return null;

  try {
    const buffer = Buffer.from(svg, "utf-8");
    if (buffer.byteLength > MAX_BYTES) return null;
    const key = `seed-${userId}.svg`;
    const client = createAvatarR2Client(cfg);
    await client.send(
      new PutObjectCommand({
        Bucket: cfg.bucket,
        Key: key,
        Body: buffer,
        ContentType: "image/svg+xml",
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
    return `${cfg.publicBaseUrl}/${key}?v=${Date.now()}`;
  } catch (err) {
    console.warn("[seeders/r2-upload] uploadAvatarSvg failed:", err);
    return null;
  }
}
