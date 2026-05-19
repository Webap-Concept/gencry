"use client";

/**
 * Helper client-side per il PUT diretto a Cloudflare R2 via presigned URL.
 * Usato sia da `MediaUploader` (admin/content/media) sia da `MediaPicker.UploadTab`.
 *
 * Pattern in 3 step (vedi `app/(admin)/admin/content/media/actions.ts`):
 *
 *   1. caller → `createMediaUploadTicketAction` (server) → ticket presigned
 *   2. caller → `uploadToR2WithProgress(file, ticket, { onProgress, signal })`
 *      → PUT via XMLHttpRequest (progress events reali, abort via signal)
 *   3. caller → `confirmMediaUploadAction(assetId)` (server) → HEAD + sanitize
 *
 * Niente resumable: PUT singolo. Limite R2 = 5GB per PUT, abbondante per
 * il CMS (limite app `MEDIA_MAX_BYTES` ~16MB). Se in futuro serve resumable
 * o file >100MB → S3 multipart con presigned-per-part.
 */

export interface R2UploadTicket {
  /** Presigned PUT URL emesso dal server (scoped a una specifica key, TTL ~5 min). */
  uploadUrl: string;
  /** Header che il PUT DEVE applicare — devono matchare il sign. */
  uploadHeaders: Record<string, string>;
  contentType: string;
}

export interface UploadToR2Options {
  /** Progress callback (0-100). Chiamato dagli `upload.onprogress` events. */
  onProgress?: (percent: number) => void;
  /** AbortSignal esterno (es. cancel button). XHR viene abortato e la
   *  promise rejecta con AbortError. */
  signal?: AbortSignal;
}

/**
 * PUT del File al presigned URL R2. Risolve sul 2xx, rejecta su qualunque
 * altro stato (4xx / 5xx / network / abort). Niente retry built-in: i 4xx
 * sono permanenti (SignatureDoesNotMatch = ticket expired) e i 5xx
 * temporanei sono rari su R2 — la decisione di ritentare resta al caller.
 */
export function uploadToR2WithProgress(
  file: File,
  ticket: R2UploadTicket,
  opts: UploadToR2Options = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", ticket.uploadUrl, true);

    // Applica gli header firmati. Per R2 presigned URL serve essenzialmente
    // Content-Type — qualunque header extra che NON era firmato causa
    // SignatureDoesNotMatch. Limitiamoci a quelli ritornati dal ticket.
    for (const [k, v] of Object.entries(ticket.uploadHeaders)) {
      xhr.setRequestHeader(k, v);
    }

    if (opts.onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && e.total > 0) {
          opts.onProgress!(
            Math.min(100, Math.round((e.loaded / e.total) * 100)),
          );
        }
      };
    }

    let aborted = false;

    const onAbort = () => {
      if (aborted) return;
      aborted = true;
      try {
        xhr.abort();
      } catch {
        /* best-effort */
      }
      reject(new DOMException("Upload aborted", "AbortError"));
    };

    if (opts.signal) {
      if (opts.signal.aborted) {
        onAbort();
        return;
      }
      opts.signal.addEventListener("abort", onAbort, { once: true });
    }

    xhr.onload = () => {
      if (aborted) return;
      if (xhr.status >= 200 && xhr.status < 300) {
        opts.onProgress?.(100);
        resolve();
        return;
      }
      const detail = xhr.responseText ? ` — ${xhr.responseText.slice(0, 200)}` : "";
      reject(new Error(`R2 PUT failed: HTTP ${xhr.status}${detail}`));
    };

    xhr.onerror = () => {
      if (aborted) return;
      reject(new Error("Network error during R2 PUT"));
    };

    xhr.ontimeout = () => {
      if (aborted) return;
      reject(new Error("Timeout during R2 PUT"));
    };

    xhr.send(file);
  });
}
