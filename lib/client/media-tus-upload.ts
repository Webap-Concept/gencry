"use client";

import * as tus from "tus-js-client";

/**
 * Helper client-side per gli upload media via TUS resumable a Supabase
 * Storage. Usato sia da `MediaUploader` (libreria admin) sia da
 * `MediaPicker.UploadTab`.
 *
 * Pattern in 3 step (vedi commento in `app/(admin)/admin/content/media/actions.ts`):
 *
 *   1. caller → `createMediaUploadTicketAction` (server) → ticket
 *   2. caller → `runTusUpload(file, ticket, { onProgress })` → PUT
 *      resumable diretto al bucket via tus-js-client
 *   3. caller → `confirmMediaUploadAction(assetId)` (server) → asset
 *      finale con publicUrl reale
 */

export interface TusTicket {
  storagePath: string;
  uploadToken: string;
  endpoint: string;
  bucketName: string;
  contentType: string;
}

export interface RunTusUploadOptions {
  /** Progress callback (0-100). Chiamato dal client TUS sulla
   *  `onProgress` events durante il PUT. */
  onProgress?: (percent: number) => void;
  /** Abort controller esterno (es. cancel button utente). */
  signal?: AbortSignal;
}

export function runTusUpload(
  file: File,
  ticket: TusTicket,
  opts: RunTusUploadOptions = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: ticket.endpoint,
      retryDelays: [0, 1000, 3000, 5000, 10000, 20000],
      headers: {
        authorization: `Bearer ${ticket.uploadToken}`,
        // x-upsert non serve: il path è UUID, mai collide con esistenti.
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      // chunkSize: lasciato default (auto). Supabase richiede multipli di
      // 6MB ma tus-js-client gestisce in autonomia.
      metadata: {
        bucketName: ticket.bucketName,
        objectName: ticket.storagePath,
        contentType: ticket.contentType,
        cacheControl: "3600",
      },
      onError: (error) => {
        // L'errore tipico è 401 (JWT scaduto), 413 (file troppo grosso) o
        // network drop dopo i retry esauriti. Bubble up al chiamante che
        // mostra il messaggio di errore appropriato.
        reject(error);
      },
      onProgress: (sent, total) => {
        if (opts.onProgress && total > 0) {
          opts.onProgress(Math.min(100, Math.round((sent / total) * 100)));
        }
      },
      onSuccess: () => {
        resolve();
      },
    });

    if (opts.signal) {
      const onAbort = () => {
        upload.abort(true).catch(() => {
          /* best-effort */
        });
        reject(new DOMException("Upload aborted", "AbortError"));
      };
      if (opts.signal.aborted) {
        onAbort();
        return;
      }
      opts.signal.addEventListener("abort", onAbort, { once: true });
    }

    upload.start();
  });
}
