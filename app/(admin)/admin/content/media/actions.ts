"use server";

import { getAdminPath } from "@/lib/admin-nav";
import {
  countAssetReferences,
  countAssetsInFolder,
  countSubfolders,
  createAsset,
  createFolder,
  deleteAssetById,
  deleteFolderById,
  getAllFolders,
  getAssetById,
  getAssets,
  getFolderById,
  updateAssetFolder,
  updateFolderName,
  type MediaAsset,
  type MediaFolder,
} from "@/lib/db/media-queries";
import { getUser } from "@/lib/db/queries";
import {
  deleteMediaFile,
  isAllowedMime,
  MEDIA_MAX_BYTES,
  uploadMediaFile,
} from "@/lib/storage/media";
import { slugify } from "@/lib/utils/slugify";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export type ActionState =
  | Record<string, never>
  | { success: string; timestamp: number }
  | { error: string; timestamp: number };

/**
 * Upload server action. Riceve uno o più file via FormData (key "files"),
 * li valida (mime + size), sanitizza eventuali SVG, carica nel bucket
 * Supabase "media" e crea le righe `media_assets`.
 *
 * Accetta un folder corrente via FormData "folderId" (vuoto/non valido = root).
 */
export async function uploadMediaAssets(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("admin.content.media.actionMessages");
  try {
    const user = await getUser();
    if (!user) return { error: t("notAuthenticated"), timestamp: Date.now() };

    const folderId = parseFolderId(formData.get("folderId"));
    if (folderId !== null && !(await getFolderById(folderId))) {
      return { error: t("folderNotFound"), timestamp: Date.now() };
    }

    const files = formData
      .getAll("files")
      .filter((v): v is File => v instanceof File && v.size > 0);
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
        folderId,
      });

      if (!result.ok) {
        errors.push(t("uploadFailed", { name: file.name }));
        continue;
      }

      await createAsset({
        folderId,
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
  } catch (err) {
    // Catch-all per evitare che il client veda errori generici "An error
    // occurred…" senza contesto. Il caso più frequente in passato era il
    // body limit di 1MB delle server actions Next: ora portato a 15MB
    // tramite next.config experimental.serverActions.bodySizeLimit, ma
    // teniamo il safety net.
    console.error("[media] uploadMediaAssets failed:", err);
    return {
      error: t("uploadFailedGeneric"),
      timestamp: Date.now(),
    };
  }
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

  // Block delete se l'asset è referenziato in qualche page.customFields.
  // Best-effort scan (vedi countAssetReferences). False positive accettabile:
  // l'admin verifica e rimuove manualmente prima di ritentare.
  const refs = await countAssetReferences(id);
  if (refs > 0) {
    return {
      error: t("deleteAssetInUse", { count: refs }),
      timestamp: Date.now(),
    };
  }

  await deleteMediaFile(asset.storagePath);
  await deleteAssetById(id);

  revalidatePath(getAdminPath("content-media"));
  return { success: t("deleted"), timestamp: Date.now() };
}

// ─── Folders ────────────────────────────────────────────────────────────────

const FOLDER_NAME_MAX = 100;
const FOLDER_NAME_MIN = 1;

function parseFolderId(raw: FormDataEntryValue | null): number | null {
  if (raw === null) return null;
  const s = String(raw).trim();
  if (s === "" || s === "root") return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function validateFolderName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length < FOLDER_NAME_MIN) return "folderNameRequired";
  if (trimmed.length > FOLDER_NAME_MAX) return "folderNameTooLong";
  const slug = slugify(trimmed);
  if (!slug) return "folderNameInvalid";
  return null;
}

export async function createMediaFolder(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("admin.content.media.actionMessages");
  const user = await getUser();
  if (!user) return { error: t("notAuthenticated"), timestamp: Date.now() };

  const name = String(formData.get("name") ?? "").trim();
  const parentId = parseFolderId(formData.get("parentId"));

  const validation = validateFolderName(name);
  if (validation) return { error: t(validation), timestamp: Date.now() };

  if (parentId !== null && !(await getFolderById(parentId))) {
    return { error: t("folderNotFound"), timestamp: Date.now() };
  }

  const slug = slugify(name);

  try {
    await createFolder({
      name,
      slug,
      parentId,
      createdBy: user.id,
    });
  } catch (err) {
    // Unique constraint (parent_id, slug)
    if (err instanceof Error && err.message.includes("uq_media_folders_parent_slug")) {
      return { error: t("folderSlugConflict"), timestamp: Date.now() };
    }
    console.error("[media] createFolder failed:", err);
    return { error: t("folderCreateFailed"), timestamp: Date.now() };
  }

  revalidatePath(getAdminPath("content-media"));
  return { success: t("folderCreated"), timestamp: Date.now() };
}

export async function renameMediaFolder(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("admin.content.media.actionMessages");
  const user = await getUser();
  if (!user) return { error: t("notAuthenticated"), timestamp: Date.now() };

  const id = parseFolderId(formData.get("id"));
  if (id === null) return { error: t("folderInvalidId"), timestamp: Date.now() };

  const name = String(formData.get("name") ?? "").trim();
  const validation = validateFolderName(name);
  if (validation) return { error: t(validation), timestamp: Date.now() };

  const folder = await getFolderById(id);
  if (!folder) return { error: t("folderNotFound"), timestamp: Date.now() };

  const slug = slugify(name);

  try {
    await updateFolderName(id, name, slug);
  } catch (err) {
    if (err instanceof Error && err.message.includes("uq_media_folders_parent_slug")) {
      return { error: t("folderSlugConflict"), timestamp: Date.now() };
    }
    console.error("[media] renameFolder failed:", err);
    return { error: t("folderRenameFailed"), timestamp: Date.now() };
  }

  revalidatePath(getAdminPath("content-media"));
  return { success: t("folderRenamed"), timestamp: Date.now() };
}

/**
 * Cancella un folder. Block se contiene asset diretti o sub-folder.
 * L'utente deve prima svuotare/spostare il contenuto. Decisione safe: niente
 * cascade automatico, troppi rischi di perdita dati.
 */
export async function deleteMediaFolder(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("admin.content.media.actionMessages");
  const user = await getUser();
  if (!user) return { error: t("notAuthenticated"), timestamp: Date.now() };

  const id = parseFolderId(formData.get("id"));
  if (id === null) return { error: t("folderInvalidId"), timestamp: Date.now() };

  const folder = await getFolderById(id);
  if (!folder) return { error: t("folderNotFound"), timestamp: Date.now() };

  const [assetCount, subCount] = await Promise.all([
    countAssetsInFolder(id),
    countSubfolders(id),
  ]);
  if (assetCount > 0 || subCount > 0) {
    return {
      error: t("folderNotEmpty", { assets: assetCount, subfolders: subCount }),
      timestamp: Date.now(),
    };
  }

  await deleteFolderById(id);

  revalidatePath(getAdminPath("content-media"));

  // Se il client stava navigando proprio dentro questa cartella, l'URL è
  // `?folder=<id>` con id appena cancellato. Senza redirect la pagina
  // rifarebbe `getFolderById(id)` → null → notFound() → 404 nel browser.
  // Redirige a root dove il toast di success arriverà sul refresh successivo.
  const currentFolderId = parseFolderId(formData.get("currentFolderId"));
  if (currentFolderId === id) {
    redirect(getAdminPath("content-media"));
  }

  return { success: t("folderDeleted"), timestamp: Date.now() };
}

/**
 * Sposta un asset in un altro folder (o root). Non muove il file fisico nel
 * bucket — il `storage_path` resta invariato. La struttura folder è solo un
 * metadato logico per l'UI; il path nel bucket è solo un layout interno.
 */
export async function moveMediaAsset(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("admin.content.media.actionMessages");
  const user = await getUser();
  if (!user) return { error: t("notAuthenticated"), timestamp: Date.now() };

  const assetId = Number(formData.get("assetId"));
  if (!Number.isFinite(assetId) || assetId <= 0) {
    return { error: t("deleteInvalidId"), timestamp: Date.now() };
  }

  const folderId = parseFolderId(formData.get("folderId"));

  const asset = await getAssetById(assetId);
  if (!asset) return { error: t("deleteNotFound"), timestamp: Date.now() };

  if (folderId !== null && !(await getFolderById(folderId))) {
    return { error: t("folderNotFound"), timestamp: Date.now() };
  }

  if (asset.folderId === folderId) {
    return { success: t("assetMoved"), timestamp: Date.now() };
  }

  await updateAssetFolder(assetId, folderId);
  revalidatePath(getAdminPath("content-media"));
  return { success: t("assetMoved"), timestamp: Date.now() };
}

// ─── Picker single-file upload ──────────────────────────────────────────────
//
// Ritorna direttamente i dati dell'asset creato. Lo usa MediaPicker per
// permettere "Upload & select" senza rerouting via page reload. Non usa
// `useActionState`: il client lo chiama come una funzione async normale.

export type PickerUploadResult =
  | {
      ok: true;
      asset: {
        id: number;
        publicUrl: string;
        filename: string;
        mime: string;
        sizeBytes: number;
      };
    }
  | { ok: false; error: string };

export async function uploadAndPickAsset(
  formData: FormData,
): Promise<PickerUploadResult> {
  const t = await getTranslations("admin.content.media.actionMessages");
  const user = await getUser();
  if (!user) return { ok: false, error: t("notAuthenticated") };

  const folderId = parseFolderId(formData.get("folderId"));
  if (folderId !== null && !(await getFolderById(folderId))) {
    return { ok: false, error: t("folderNotFound") };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: t("noFiles") };
  }

  if (!isAllowedMime(file.type)) {
    return { ok: false, error: t("mimeNotAllowed", { name: file.name }) };
  }
  if (file.size > MEDIA_MAX_BYTES) {
    return { ok: false, error: t("fileTooLarge", { name: file.name }) };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await uploadMediaFile({
    buffer,
    mime: file.type,
    originalFilename: file.name,
    folderId,
  });
  if (!result.ok) {
    return { ok: false, error: t("uploadFailed", { name: file.name }) };
  }

  const created = await createAsset({
    folderId,
    filename: result.data.filename,
    mime: result.data.mime,
    sizeBytes: result.data.sizeBytes,
    storagePath: result.data.storagePath,
    publicUrl: result.data.publicUrl,
    uploadedBy: user.id,
  });

  revalidatePath(getAdminPath("content-media"));
  return {
    ok: true,
    asset: {
      id: created.id,
      publicUrl: created.publicUrl,
      filename: created.filename,
      mime: created.mime,
      sizeBytes: created.sizeBytes,
    },
  };
}

/**
 * Carica folders + assets per il MediaPicker. Chiamata al dialog open e ad
 * ogni cambio di folder. Filtra per `imageOnly` quando il picker è di un
 * fieldType=image (non vogliamo mostrare PDF/MP4 quando l'admin sta scegliendo
 * un'immagine).
 */
export async function getMediaPickerData(
  folderId: number | null,
  opts: { imageOnly?: boolean } = {},
): Promise<{ folders: MediaFolder[]; assets: MediaAsset[] }> {
  const [folders, allAssets] = await Promise.all([
    getAllFolders(),
    getAssets({ folderId }),
  ]);
  const assets = opts.imageOnly
    ? allAssets.filter((a) => a.mime.startsWith("image/"))
    : allAssets;
  return { folders, assets };
}

/**
 * Lookup leggero per ottenere la preview di un asset già selezionato (nel
 * MediaPickerField). Ritorna null se l'asset è stato eliminato.
 */
export async function getMediaAssetPreview(
  id: number,
): Promise<{ id: number; publicUrl: string; filename: string; mime: string } | null> {
  if (!Number.isFinite(id) || id <= 0) return null;
  const asset = await getAssetById(id);
  if (!asset) return null;
  return {
    id: asset.id,
    publicUrl: asset.publicUrl,
    filename: asset.filename,
    mime: asset.mime,
  };
}
