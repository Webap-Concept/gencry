// lib/modules/posts/services/media-processor.ts
//
// Service astratto per il processing delle immagini caricate sui post:
// resize (full 2048px, thumb 400px), conversione webp, EXIF strip.
//
// Stato: STUB in PR-2. L'impl reale arriva in PR-6 con Vercel + sharp
// (vedi project_social_storage_r2 §Processing F1/F2). V2 a Cloudflare
// Worker + R2 Queue + photon-wasm.
//
// L'astrazione esiste già qui perché:
//   - le Server Actions di PR-3 (confirmPostMediaUpload) chiameranno
//     processPostMedia(assetId), che deve esistere come API stabile
//   - la sostituzione Vercel→Worker non deve toccare la Server Action

export type ProcessPostMediaResult = {
  fullUrl: string;
  thumbUrl: string;
  width: number;
  height: number;
};

export class MediaProcessorNotImplementedError extends Error {
  constructor() {
    super(
      "posts.media.processor_not_implemented — the real implementation " +
        "ships in PR-6 (Vercel + sharp). For now, postsMedia rows can be " +
        "inserted as drafts but confirmPostMediaUpload will fail until then.",
    );
    this.name = "MediaProcessorNotImplementedError";
  }
}

/**
 * Stub: lancia sempre. La Server Action `confirmPostMediaUpload` (PR-3)
 * dovrà gestire questo errore e segnalarlo come "media processing non
 * ancora disponibile" oppure rinviare la conferma a un job successivo.
 *
 * Una volta che PR-6 sostituisce l'impl, il chiamante non vede nessuna
 * differenza di shape.
 */
export async function processPostMedia(
  _assetId: string,
): Promise<ProcessPostMediaResult> {
  throw new MediaProcessorNotImplementedError();
}
