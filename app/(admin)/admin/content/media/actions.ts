"use server";

import { getAdminPath } from "@/lib/admin-paths";
import {
  confirmAsset,
  countAssetReferences,
  countAssetsInFolder,
  countSubfolders,
  createDraftAsset,
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
  createMediaUploadTicket,
  deleteMediaFile,
  isAllowedMime,
  MEDIA_MAX_BYTES,
  type MediaMime,
  verifyAndConfirmMedia,
} from "@/lib/storage/media";
import { slugify } from "@/lib/utils/slugify";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

// NOTE on revalidatePath:
// In Next 16 dev mode, calling revalidatePath() inside a server action
// triggers a full route recompile that can hang the response for many
// seconds (or appear stuck). The client never sees the response and the
// upload looks frozen. We dropped revalidatePath here entirely; client
// components call router.refresh() after a successful dispatch, which is
// instant in dev and equivalent semantics in prod.
//
// The one place we still need server-side cache invalidation is the
// folder delete that redirects when the deleted folder is the active
// one — there `redirect()` itself causes a re-render of the destination.

export type ActionState =
  | Record<string, never>
  | { success: string; timestamp: number }
  | { error: string; timestamp: number };

// ─── Ticket-based upload (TUS resumable) ───────────────────────────────────
//
// Vecchio flusso `uploadMediaAssets` (server action che riceveva i file)
// rimosso: il body limit di Vercel (4.5MB hard cap su tutti i piani)
// fermava qualunque file >4MB prima di arrivare alla nostra logica. Ora:
//
//   1. `createMediaUploadTicket` — server valida (mime + size + folder),
//      genera storage_path, INSERT-a una riga draft (confirmed_at=NULL),
//      minta un JWT short-lived per Supabase TUS, e ritorna il ticket.
//   2. Client → `tus-js-client` PUT diretto al bucket `media`. Resumable
//      su drop di rete, progress events reali (% completata).
//   3. `confirmMediaUpload` — server verifica file presente nel bucket,
//      sanitizza SVG in-place se necessario, e setta `confirmed_at`.
//
// Cleanup orphans: cron `media-orphan-cleanup` (vedi
// `deleteUnconfirmedAssets` in lib/db/media-queries.ts) cancella draft
// >24h non confermate. Configurabile in Supabase pg_cron.

export type MediaUploadTicketResult =
  | {
      ok: true;
      assetId: number;
      storagePath: string;
      uploadToken: string;
      endpoint: string;
      bucketName: string;
      contentType: string;
    }
  | { ok: false; error: string };

/**
 * Step 1: validazione server-side + creazione draft + JWT per TUS.
 * Il client non riceve mai service-role; il JWT è scoped al bucket
 * `media` con TTL 2 min (vedi `mintSupabaseUploadJwt`).
 */
export async function createMediaUploadTicketAction(input: {
  filename: string;
  mime: string;
  size: number;
  folderId: number | null;
}): Promise<MediaUploadTicketResult> {
  const t = await getTranslations("admin.content.media.actionMessages");
  try {
    const user = await getUser();
    if (!user) return { ok: false, error: t("notAuthenticated") };

    const filename = (input.filename ?? "").trim();
    if (!filename) return { ok: false, error: t("noFiles") };

    if (!isAllowedMime(input.mime)) {
      return { ok: false, error: t("mimeNotAllowed", { name: filename }) };
    }
    if (
      !Number.isFinite(input.size) ||
      input.size <= 0 ||
      input.size > MEDIA_MAX_BYTES
    ) {
      return { ok: false, error: t("fileTooLarge", { name: filename }) };
    }

    if (input.folderId !== null && !(await getFolderById(input.folderId))) {
      return { ok: false, error: t("folderNotFound") };
    }

    const ticket = await createMediaUploadTicket({
      mime: input.mime as MediaMime,
      folderId: input.folderId,
      userId: user.id,
    });

    // publicUrl è deterministica (getPublicUrl) — la salviamo subito sulla
    // draft. Sarà valida non appena il file esiste fisicamente nel bucket.
    const draft = await createDraftAsset({
      folderId: input.folderId,
      filename,
      mime: ticket.contentType,
      sizeBytes: input.size,
      storagePath: ticket.storagePath,
      publicUrl: ticket.publicUrl,
      uploadedBy: user.id,
    });

    return {
      ok: true,
      assetId: draft.id,
      storagePath: ticket.storagePath,
      uploadToken: ticket.uploadToken,
      endpoint: ticket.endpoint,
      bucketName: ticket.bucketName,
      contentType: ticket.contentType,
    };
  } catch (err) {
    console.error("[media] createMediaUploadTicketAction failed:", err);
    return { ok: false, error: t("uploadFailedGeneric") };
  }
}

export type MediaUploadConfirmResult =
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

/**
 * Step 3: il client ha terminato il TUS upload, chiede al server di
 * verificare e confermare. Sanitizza SVG in-place (download → clean →
 * re-upload con upsert) prima di mettere `confirmed_at`. Se la verifica
 * fallisce (file mai arrivato, sanitization svuota il payload), la riga
 * draft viene cancellata e ritorniamo errore: l'utente potrà ritentare.
 */
export async function confirmMediaUploadAction(input: {
  assetId: number;
}): Promise<MediaUploadConfirmResult> {
  const t = await getTranslations("admin.content.media.actionMessages");
  try {
    const user = await getUser();
    if (!user) return { ok: false, error: t("notAuthenticated") };

    if (!Number.isFinite(input.assetId) || input.assetId <= 0) {
      return { ok: false, error: t("deleteInvalidId") };
    }

    const draft = await getAssetById(input.assetId);
    if (!draft) return { ok: false, error: t("deleteNotFound") };

    // Idempotenza: se già confermata, ritorniamo l'asset corrente
    if (draft.confirmedAt) {
      return {
        ok: true,
        asset: {
          id: draft.id,
          publicUrl: draft.publicUrl,
          filename: draft.filename,
          mime: draft.mime,
          sizeBytes: draft.sizeBytes,
        },
      };
    }

    // Ownership: solo l'admin che ha aperto il ticket può confermarlo.
    // Difesa in profondità: in pratica passa per requireAdminPage.
    if (draft.uploadedBy !== user.id) {
      return { ok: false, error: t("notAuthenticated") };
    }

    const verify = await verifyAndConfirmMedia({
      storagePath: draft.storagePath,
      mime: draft.mime as MediaMime,
    });
    if (!verify.ok) {
      // Cleanup: file non c'è / sanitization fallita → cancella draft.
      // Storage è già pulito (verifyAndConfirmMedia cancella su SVG fail)
      // o non c'è mai stato.
      await deleteAssetById(draft.id);
      return {
        ok: false,
        error: t("uploadFailed", { name: draft.filename }),
      };
    }

    // publicUrl era già stata calcolata e salvata al ticket creation —
    // non serve aggiornarla qui. Settiamo solo confirmed_at.
    await confirmAsset(draft.id);

    return {
      ok: true,
      asset: {
        id: draft.id,
        publicUrl: verify.publicUrl,
        filename: draft.filename,
        mime: draft.mime,
        sizeBytes: draft.sizeBytes,
      },
    };
  } catch (err) {
    console.error("[media] confirmMediaUploadAction failed:", err);
    return { ok: false, error: t("uploadFailedGeneric") };
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

  // Se il client stava navigando proprio dentro questa cartella, l'URL è
  // `?folder=<id>` con id appena cancellato. Senza redirect la pagina
  // rifarebbe `getFolderById(id)` → null → notFound() → 404 nel browser.
  const currentFolderId = parseFolderId(formData.get("currentFolderId"));
  if (currentFolderId === id) {
    redirect(await getAdminPath("content-media"));
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
  return { success: t("assetMoved"), timestamp: Date.now() };
}

// ─── Picker single-file upload ──────────────────────────────────────────────
//
// Vecchio `uploadAndPickAsset` rimosso: aveva lo stesso 4.5MB cap di Vercel.
// Il MediaPicker ora usa lo stesso flusso a tre step (`createMediaUploadTicketAction`
// → TUS resumable client-side → `confirmMediaUploadAction`). L'asset
// ritornato da confirm ha già la shape compatibile con la selezione picker.

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
