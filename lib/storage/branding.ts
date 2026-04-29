import "server-only";

import { getStorageClient } from "@/lib/storage/supabase";

export const BRANDING_BUCKET = "branding";

export type BrandingSlot = "logo" | "logo-variant" | "favicon";

export const BRANDING_LIMITS = {
  maxBytes: 1024 * 1024, // 1 MB
  allowedMime: [
    "image/png",
    "image/jpeg",
    "image/svg+xml",
    "image/webp",
    "image/x-icon",
    "image/vnd.microsoft.icon",
  ] as const,
} as const;

function extFromMime(mime: string): string {
  switch (mime) {
    case "image/png": return "png";
    case "image/jpeg": return "jpg";
    case "image/svg+xml": return "svg";
    case "image/webp": return "webp";
    case "image/x-icon":
    case "image/vnd.microsoft.icon":
      return "ico";
    default: return "bin";
  }
}

/**
 * Upload a branding asset. Generates a unique filename so the public URL
 * changes on each upload (avoids CDN cache pinning to the old image).
 * Returns the public URL.
 */
export async function uploadBrandingAsset(
  slot: BrandingSlot,
  file: File,
): Promise<string> {
  if (!BRANDING_LIMITS.allowedMime.includes(file.type as never)) {
    throw new Error(`Formato non supportato: ${file.type || "sconosciuto"}`);
  }
  if (file.size > BRANDING_LIMITS.maxBytes) {
    throw new Error(
      `File troppo grande (max ${BRANDING_LIMITS.maxBytes / 1024 / 1024} MB)`,
    );
  }

  const supabase = getStorageClient();
  const ext = extFromMime(file.type);
  const path = `${slot}-${Date.now()}.${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadErr } = await supabase.storage
    .from(BRANDING_BUCKET)
    .upload(path, buffer, {
      contentType: file.type,
      upsert: false,
      cacheControl: "31536000", // 1 anno (URL cambia ad ogni upload)
    });

  if (uploadErr) {
    throw new Error(`Upload fallito: ${uploadErr.message}`);
  }

  const { data } = supabase.storage
    .from(BRANDING_BUCKET)
    .getPublicUrl(path);

  return data.publicUrl;
}

/**
 * Delete a previously uploaded asset by its public URL.
 * No-op if the URL doesn't belong to our bucket.
 */
export async function deleteBrandingAsset(publicUrl: string | null): Promise<void> {
  if (!publicUrl) return;
  const marker = `/object/public/${BRANDING_BUCKET}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return;
  const path = publicUrl.slice(idx + marker.length);
  if (!path) return;
  const supabase = getStorageClient();
  await supabase.storage.from(BRANDING_BUCKET).remove([path]);
}
