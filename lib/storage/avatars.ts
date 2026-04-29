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
