// lib/storage/branding.ts
//
// Layer "logico" del branding admin. Astrazione dei concept slot/limit
// sopra al backend R2 storage (lib/storage/r2-assets.ts).
//
// Prima del 2026-05-20 questo file usava Supabase Storage. Migrazione
// a R2 voluta perché logo e favicon sono gli asset più richiesti del
// sito (header + footer + meta OG su ogni page view) e Supabase egress
// era il primo a esaurirsi. R2 ha 0 egress.
//
// API pubblica `uploadBrandingAsset` / `deleteBrandingAsset` invariata
// nella firma — i caller (admin settings actions, email layout, ecc.)
// non si accorgono del cambio backend.
import "server-only";

import {
  deleteAssetObject,
  extractKeyFromPublicUrl,
  getAssetPublicUrl,
  loadAssetsR2Config,
  putAssetObject,
} from "@/lib/storage/r2-assets";

// Slot estesi 2026-05-20:
//   - logo / logo-variant / favicon  → header/footer/tab del sito
//   - og-image                       → meta og:image default per share social
//   - pwa-icon-192 / pwa-icon-512    → icone manifest PWA (Add to Home Screen)
export type BrandingSlot =
  | "logo"
  | "logo-variant"
  | "favicon"
  | "og-image"
  | "pwa-icon-192"
  | "pwa-icon-512";

export const BRANDING_SLOTS: readonly BrandingSlot[] = [
  "logo",
  "logo-variant",
  "favicon",
  "og-image",
  "pwa-icon-192",
  "pwa-icon-512",
] as const;

export const BRANDING_LIMITS = {
  maxBytes: 1024 * 1024, // 1 MB — anche per OG image è sufficiente con compressione decente
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
 * Upload di un brand asset su R2. Filename = `<slot>-<timestamp>.<ext>`
 * → key univoca per ogni upload (cache CDN / browser non vede mai uno
 * stale: nuovo upload = nuovo URL = cache miss naturale).
 *
 * Ritorna la public URL pronta da salvare in app_settings.
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

  const cfg = await loadAssetsR2Config();
  if (!cfg) {
    throw new Error(
      "Storage R2 per gli asset di brand non configurato. " +
        "Completa /admin/services/cloudflare → R2 storage (assets).",
    );
  }

  const ext = extFromMime(file.type);
  const key = `${slot}-${Date.now()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  await putAssetObject({
    cfg,
    key,
    body: buffer,
    contentType: file.type,
  });

  return getAssetPublicUrl(cfg, key);
}

/**
 * Cancella un asset dato il public URL. No-op se l'URL non appartiene
 * al bucket R2 (es. URL legacy Supabase, che non possiamo cancellare
 * da qui — la fonte legacy va pulita a parte).
 */
export async function deleteBrandingAsset(publicUrl: string | null): Promise<void> {
  if (!publicUrl) return;
  const cfg = await loadAssetsR2Config();
  if (!cfg) return;
  const key = extractKeyFromPublicUrl(cfg, publicUrl);
  if (!key) return;
  await deleteAssetObject(cfg, key);
}
