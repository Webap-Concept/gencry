// lib/storage/gdpr-exports.ts
//
// Helpers per il bucket privato `gdpr-exports`. Solo lettura via signed
// URL: nessun access pubblico, nessun upsert dato che ogni job ha un id
// univoco e quindi un path unico.

import "server-only";
import { getStorageClient } from "./supabase";

const BUCKET = "gdpr-exports";
const SIGNED_URL_TTL_SECONDS = 24 * 60 * 60; // 24h

/**
 * Carica il JSON dell'export per un job. Ritorna il path salvato in DB
 * sulla colonna `storage_path`. Path = `{userId}/{jobId}.json`.
 */
export async function uploadGdprExport(params: {
  userId: string;
  jobId: string;
  payload: unknown;
}): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const { userId, jobId, payload } = params;
  const path = `${userId}/${jobId}.json`;

  const body = Buffer.from(JSON.stringify(payload, null, 2), "utf8");
  const { error } = await getStorageClient()
    .storage.from(BUCKET)
    .upload(path, body, {
      contentType: "application/json",
      upsert: false,
    });

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true, path };
}

/**
 * Genera una signed URL fresca per il file. Chi chiama deve già aver
 * verificato l'ownership del job (i.e. job.userId === currentUser.id).
 */
export async function getGdprExportSignedUrl(
  storagePath: string,
): Promise<string | null> {
  const { data, error } = await getStorageClient()
    .storage.from(BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

  if (error || !data) return null;
  return data.signedUrl;
}

/**
 * Rimuove il file dal bucket. Idempotente: se non esiste, non fa nulla.
 * Usato dal cron di pulizia quando un job scade.
 */
export async function deleteGdprExport(storagePath: string): Promise<void> {
  const { error } = await getStorageClient()
    .storage.from(BUCKET)
    .remove([storagePath]);

  if (error) {
    // Non rilanciamo: la pulizia è best-effort. Logghiamo per visibilità.
    console.error("[gdpr-exports] delete failed:", storagePath, error.message);
  }
}
