"use server";

import { getAdminPath } from "@/lib/admin-nav";
import {
  createAsset,
  deleteAssetById,
  getAssetById,
} from "@/lib/db/media-queries";
import { getUser } from "@/lib/db/queries";
import {
  deleteMediaFile,
  isAllowedMime,
  MEDIA_MAX_BYTES,
  uploadMediaFile,
} from "@/lib/storage/media";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";

export type ActionState =
  | Record<string, never>
  | { success: string; timestamp: number }
  | { error: string; timestamp: number };

/**
 * Upload server action. Riceve uno o più file via FormData (key "files"),
 * li valida (mime + size), sanitizza eventuali SVG, carica nel bucket
 * Supabase "media" e crea le righe `media_assets`.
 *
 * In v1 il folderId è sempre null (root) — la gestione folder arriva nella
 * PR successiva.
 */
export async function uploadMediaAssets(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("admin.content.media.actionMessages");
  const user = await getUser();
  if (!user) return { error: t("notAuthenticated"), timestamp: Date.now() };

  const files = formData.getAll("files").filter((v): v is File => v instanceof File && v.size > 0);
  if (files.length === 0) {
    return { error: t("noFiles"), timestamp: Date.now() };
  }

  const errors: string[] = [];
  let uploaded = 0;

  for (const file of files) {
    if (!isAllowedMime(file.type)) {
      errors.push(t("mimeNotAllowed", { name: file.name }));
      continue;
    }
    if (file.size > MEDIA_MAX_BYTES) {
      errors.push(t("fileTooLarge", { name: file.name }));
      continue;
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await uploadMediaFile({
      buffer,
      mime: file.type,
      originalFilename: file.name,
      folderId: null,
    });

    if (!result.ok) {
      errors.push(t("uploadFailed", { name: file.name }));
      continue;
    }

    await createAsset({
      folderId: null,
      filename: result.data.filename,
      mime: result.data.mime,
      sizeBytes: result.data.sizeBytes,
      storagePath: result.data.storagePath,
      publicUrl: result.data.publicUrl,
      uploadedBy: user.id,
    });
    uploaded += 1;
  }

  revalidatePath(getAdminPath("content-media"));

  if (uploaded === 0) {
    return {
      error: errors[0] ?? t("uploadFailedGeneric"),
      timestamp: Date.now(),
    };
  }

  if (errors.length > 0) {
    return {
      success: t("uploadedPartial", { ok: uploaded, failed: errors.length }),
      timestamp: Date.now(),
    };
  }

  return {
    success: t("uploaded", { count: uploaded }),
    timestamp: Date.now(),
  };
}

/**
 * Cancella un asset: prima rimuove il file dal bucket, poi la riga DB.
 * Order matters: se il bucket fallisce torniamo errore senza toccare il DB
 * (l'admin può ritentare); se il DB fallisce dopo il bucket, l'asset è
 * già orfano nello storage — accettabile in v1, eventualmente coperto da
 * un job di garbage-collect.
 */
export async function deleteMediaAsset(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("admin.content.media.actionMessages");
  const user = await getUser();
  if (!user) return { error: t("notAuthenticated"), timestamp: Date.now() };

  const idRaw = formData.get("id");
  const id = Number(idRaw);
  if (!Number.isFinite(id) || id <= 0) {
    return { error: t("deleteInvalidId"), timestamp: Date.now() };
  }

  const asset = await getAssetById(id);
  if (!asset) {
    return { error: t("deleteNotFound"), timestamp: Date.now() };
  }

  await deleteMediaFile(asset.storagePath);
  await deleteAssetById(id);

  revalidatePath(getAdminPath("content-media"));
  return { success: t("deleted"), timestamp: Date.now() };
}
