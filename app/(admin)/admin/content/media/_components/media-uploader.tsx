"use client";

import { AdminToast } from "@/app/(admin)/admin/_components/toast";
import { runTusUpload } from "@/lib/client/media-tus-upload";
import { Loader2, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
  confirmMediaUploadAction,
  createMediaUploadTicketAction,
} from "../actions";
import {
  MEDIA_ALLOWED_MIMES_HINT,
  MEDIA_MAX_MB_HINT,
} from "./media-constants";

const ACCEPT = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/svg+xml",
  "application/pdf",
  "video/mp4",
  "video/webm",
].join(",");

type FileItem = {
  id: string;
  name: string;
  size: number;
  status: "queued" | "uploading" | "confirming" | "done" | "error";
  /** 0..100 — popolato durante TUS PUT */
  progress: number;
  error?: string;
};

export function MediaUploader({
  currentFolderId,
}: {
  currentFolderId: number | null;
}) {
  const t = useTranslations("admin.content.media.uploader");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<FileItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  function updateItem(id: string, patch: Partial<FileItem>) {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    );
  }

  async function uploadOne(item: FileItem, file: File): Promise<boolean> {
    // Step 1: ticket server
    const ticket = await createMediaUploadTicketAction({
      filename: file.name,
      mime: file.type,
      size: file.size,
      folderId: currentFolderId,
    });
    if (!ticket.ok) {
      updateItem(item.id, { status: "error", error: ticket.error });
      return false;
    }

    // Step 2: TUS resumable PUT diretto al bucket
    updateItem(item.id, { status: "uploading", progress: 0 });
    try {
      await runTusUpload(file, ticket, {
        onProgress: (percent) => updateItem(item.id, { progress: percent }),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "upload_failed";
      updateItem(item.id, { status: "error", error: msg });
      return false;
    }

    // Step 3: confirm server (verifica esistenza + sanitize SVG + confirmed_at)
    updateItem(item.id, { status: "confirming", progress: 100 });
    const confirm = await confirmMediaUploadAction({ assetId: ticket.assetId });
    if (!confirm.ok) {
      updateItem(item.id, { status: "error", error: confirm.error });
      return false;
    }

    updateItem(item.id, { status: "done" });
    return true;
  }

  async function handleFiles(files: FileList) {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    const newItems: FileItem[] = fileArray.map((f) => ({
      id: `${f.name}-${f.size}-${crypto.randomUUID()}`,
      name: f.name,
      size: f.size,
      status: "queued",
      progress: 0,
    }));
    setItems((prev) => [...prev, ...newItems]);
    setBusy(true);

    let okCount = 0;
    let failCount = 0;
    // Serial: rispetta i limiti del browser (TUS apre comunque un POST per
    // ogni upload), evita di saturare la connessione + dà progress chiaro.
    for (let i = 0; i < fileArray.length; i++) {
      const item = newItems[i];
      const file = fileArray[i];
      const ok = await uploadOne(item, file);
      if (ok) okCount += 1;
      else failCount += 1;
    }

    setBusy(false);
    if (okCount > 0) {
      router.refresh();
      setToast({
        message:
          failCount === 0
            ? t("uploaded", { count: okCount })
            : t("uploadedPartial", { ok: okCount, failed: failCount }),
        type: failCount === 0 ? "success" : "error",
      });
    } else {
      setToast({
        message: t("uploadFailedGeneric"),
        type: "error",
      });
    }

    // Cleanup queue completati dopo un attimo, mantieni solo error
    setTimeout(() => {
      setItems((prev) => prev.filter((it) => it.status === "error"));
    }, 2500);

    if (inputRef.current) inputRef.current.value = "";
  }

  const activeCount = items.filter(
    (it) => it.status === "uploading" || it.status === "confirming" || it.status === "queued",
  ).length;

  return (
    <>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h3
            className="text-sm font-medium"
            style={{ color: "var(--admin-text)" }}>
            {t("title")}
          </h3>
          <p
            className="text-xs mt-1"
            style={{ color: "var(--admin-text-muted)" }}>
            {t("hint", {
              maxMb: MEDIA_MAX_MB_HINT,
              mimes: MEDIA_ALLOWED_MIMES_HINT,
            })}
          </p>
        </div>

        <label
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors"
          style={{
            background: "var(--admin-accent)",
            color: "var(--admin-accent-foreground, white)",
            opacity: busy ? 0.6 : 1,
            pointerEvents: busy ? "none" : "auto",
          }}>
          {busy ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Upload className="w-4 h-4" />
          )}
          {busy ? t("uploading") : t("button")}
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            multiple
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              if (e.target.files) {
                void handleFiles(e.target.files);
              }
            }}
          />
        </label>
      </div>

      {activeCount > 0 && <UploadOverlay items={items} />}

      {toast && (
        <AdminToast
          message={toast.message}
          type={toast.type}
          onDismiss={() => setToast(null)}
        />
      )}
    </>
  );
}

/**
 * Overlay con progress per file, durante l'upload TUS. Sostituisce il
 * vecchio "loading…" generico — ora mostra % reale per ogni file in coda.
 * Blocca l'interazione finché tutti i file sono done/error.
 */
function UploadOverlay({ items }: { items: FileItem[] }) {
  const t = useTranslations("admin.content.media.uploader");
  const inFlight = items.filter(
    (it) => it.status === "uploading" || it.status === "confirming" || it.status === "queued",
  );
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      role="alert"
      aria-busy="true">
      <div
        className="rounded-xl px-6 py-5 shadow-xl w-full max-w-md space-y-4"
        style={{
          background: "var(--admin-card-bg)",
          border: "1px solid var(--admin-card-border)",
        }}>
        <div className="flex items-center gap-3">
          <Loader2
            className="w-5 h-5 animate-spin flex-shrink-0"
            style={{ color: "var(--admin-accent)" }}
          />
          <div>
            <p
              className="text-sm font-medium"
              style={{ color: "var(--admin-text)" }}>
              {inFlight.length > 1
                ? t("overlayUploadingMany", { count: inFlight.length })
                : t("overlayUploading")}
            </p>
            <p
              className="text-xs mt-0.5"
              style={{ color: "var(--admin-text-muted)" }}>
              {t("overlayHint")}
            </p>
          </div>
        </div>

        <ul className="space-y-2 max-h-64 overflow-y-auto">
          {inFlight.map((it) => (
            <li key={it.id} className="space-y-1">
              <div className="flex items-center justify-between gap-3">
                <span
                  className="text-xs truncate"
                  style={{ color: "var(--admin-text)" }}
                  title={it.name}>
                  {it.name}
                </span>
                <span
                  className="text-xs font-mono shrink-0"
                  style={{ color: "var(--admin-text-muted)" }}>
                  {it.status === "confirming"
                    ? "…"
                    : `${it.progress}%`}
                </span>
              </div>
              <div
                className="h-1.5 rounded-full overflow-hidden"
                style={{ background: "var(--admin-page-bg)" }}>
                <div
                  className="h-full transition-[width] duration-150"
                  style={{
                    width: `${it.progress}%`,
                    background: "var(--admin-accent)",
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
