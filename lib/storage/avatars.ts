import "server-only";

import { getStorageClient } from "./supabase";

const BUCKET = "avatars";

/**
 * Scarica un'immagine da un URL esterno (es. Google OAuth picture)
 * e la carica nel bucket "avatars" di Supabase Storage.
 * Ritorna l'URL pubblico permanente, oppure null se il download o l'upload fallisce.
 *
 * Il file viene salvato in {userId}/avatar.{ext} — sovrascrive eventuali versioni precedenti.
 */
export async function uploadAvatarFromUrl(
  pictureUrl: string,
  userId: string,
): Promise<string | null> {
  try {
    const response = await fetch(pictureUrl);
    if (!response.ok) return null;

    const contentType = response.headers.get("content-type") ?? "image/jpeg";
    const ext = contentType.includes("png")
      ? "png"
      : contentType.includes("webp")
        ? "webp"
        : "jpg";

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const path = `${userId}/avatar.${ext}`;
    const supabase = getStorageClient();

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, {
        contentType,
        upsert: true,
      });

    if (error) {
      console.error("[avatars] upload failed:", error.message);
      return null;
    }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return data.publicUrl;
  } catch (err) {
    console.error("[avatars] uploadAvatarFromUrl failed:", err);
    return null;
  }
}

const ALLOWED_MIME = ["image/png", "image/jpeg", "image/webp"] as const;
type AllowedMime = (typeof ALLOWED_MIME)[number];

function extFromMime(mime: AllowedMime): "png" | "jpg" | "webp" {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

/**
 * Carica un avatar inviato dall'utente. Path stabile {userId}/avatar.{ext},
 * upsert. L'URL pubblico restituito ha un suffisso ?v=<timestamp> per
 * invalidare la cache CDN/browser quando l'utente sostituisce la foto.
 */
export async function uploadAvatarFromBuffer(
  userId: string,
  buffer: Buffer,
  mime: string,
): Promise<{ url: string } | { error: string }> {
  if (!(ALLOWED_MIME as readonly string[]).includes(mime)) {
    return { error: "Formato non supportato. Usa PNG, JPG o WebP." };
  }
  const ext = extFromMime(mime as AllowedMime);
  const path = `${userId}/avatar.${ext}`;

  const supabase = getStorageClient();

  const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType: mime,
    upsert: true,
  });

  if (error) {
    console.error("[avatars] uploadAvatarFromBuffer failed:", error.message);
    return { error: "Caricamento fallito. Riprova." };
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: `${data.publicUrl}?v=${Date.now()}` };
}
