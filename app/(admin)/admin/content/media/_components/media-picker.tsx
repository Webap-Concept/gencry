"use client";

import type { MediaAsset, MediaFolder } from "@/lib/db/media-queries";
import { getOptimizedImageProps } from "@/lib/storage/image-optimizer";
import {
  isAllowedMime,
  MEDIA_MAX_BYTES,
  MEDIA_MAX_MB_HINT,
} from "@/lib/storage/media-constants";
import { FileText, Folder, Loader2, Upload, X } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import {
  startTransition,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { runTusUpload } from "@/lib/client/media-tus-upload";
import {
  confirmMediaUploadAction,
  createMediaUploadTicketAction,
  getMediaPickerData,
} from "../actions";

export interface PickedAsset {
  id: number;
  publicUrl: string;
  filename: string;
  mime: string;
}

interface MediaPickerProps {
  open: boolean;
  imageOnly?: boolean;
  onClose: () => void;
  onSelect: (asset: PickedAsset) => void;
}

interface FolderOption {
  id: number | null;
  label: string;
  depth: number;
}

function flattenFolders(folders: MediaFolder[], rootLabel: string): FolderOption[] {
  const byParent = new Map<number | null, MediaFolder[]>();
  for (const f of folders) {
    const list = byParent.get(f.parentId) ?? [];
    list.push(f);
    byParent.set(f.parentId, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }

  const out: FolderOption[] = [{ id: null, label: rootLabel, depth: 0 }];
  const walk = (parentId: number | null, depth: number) => {
    const children = byParent.get(parentId) ?? [];
    for (const c of children) {
      out.push({ id: c.id, label: c.name, depth });
      walk(c.id, depth + 1);
    }
  };
  walk(null, 1);
  return out;
}

export function MediaPicker({
  open,
  imageOnly,
  onClose,
  onSelect,
}: MediaPickerProps) {
  const t = useTranslations("admin.content.media.picker");
  const [tab, setTab] = useState<"library" | "upload">("library");
  const [folderId, setFolderId] = useState<number | null>(null);
  const [folders, setFolders] = useState<MediaFolder[]>([]);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, startLoading] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const folderOptions = useMemo(
    () => flattenFolders(folders, t("root")),
    [folders, t],
  );

  // Load assets quando il dialog è open o cambia folder
  useEffect(() => {
    if (!open) return;
    setError(null);
    startLoading(async () => {
      const data = await getMediaPickerData(folderId, { imageOnly });
      setFolders(data.folders);
      setAssets(data.assets);
    });
  }, [open, folderId, imageOnly]);

  // Reset state on close
  useEffect(() => {
    if (!open) {
      setTab("library");
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}>
      <div
        className="rounded-xl shadow-xl w-full max-w-4xl max-h-[85vh] flex flex-col"
        style={{
          background: "var(--admin-card-bg)",
          border: "1px solid var(--admin-card-border)",
        }}
        onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: "var(--admin-card-border)" }}>
          <h3
            className="text-base font-semibold"
            style={{ color: "var(--admin-text)" }}>
            {t("title")}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/5"
            style={{ color: "var(--admin-text-muted)" }}
            aria-label={t("close")}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div
          className="flex gap-1 px-5 pt-3 border-b"
          style={{ borderColor: "var(--admin-card-border)" }}>
          <TabButton
            active={tab === "library"}
            onClick={() => setTab("library")}
            label={t("tabLibrary")}
          />
          <TabButton
            active={tab === "upload"}
            onClick={() => setTab("upload")}
            label={t("tabUpload")}
          />
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 min-h-[300px]">
          {tab === "library" ? (
            <LibraryTab
              folderId={folderId}
              folderOptions={folderOptions}
              onFolderChange={setFolderId}
              assets={assets}
              loading={loading}
              imageOnly={imageOnly}
              onSelect={(asset) => {
                onSelect({
                  id: asset.id,
                  publicUrl: asset.publicUrl,
                  filename: asset.filename,
                  mime: asset.mime,
                });
                onClose();
              }}
            />
          ) : (
            <UploadTab
              folderId={folderId}
              folderOptions={folderOptions}
              onFolderChange={setFolderId}
              imageOnly={imageOnly}
              onUploaded={(asset) => {
                onSelect(asset);
                onClose();
              }}
              error={error}
              setError={setError}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-4 py-2 text-sm font-medium border-b-2 -mb-px"
      style={{
        borderColor: active ? "var(--admin-accent)" : "transparent",
        color: active ? "var(--admin-accent)" : "var(--admin-text-muted)",
      }}>
      {label}
    </button>
  );
}

function FolderSelect({
  value,
  options,
  onChange,
  label,
}: {
  value: number | null;
  options: FolderOption[];
  onChange: (id: number | null) => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <Folder className="w-4 h-4" style={{ color: "var(--admin-text-muted)" }} />
      <span style={{ color: "var(--admin-text-muted)" }}>{label}</span>
      <select
        value={value ?? ""}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === "" ? null : Number(v));
        }}
        className="px-2 py-1 rounded-md text-sm"
        style={{
          background: "var(--admin-page-bg, var(--admin-card-bg))",
          border: "1px solid var(--admin-input-border, var(--admin-card-border))",
          color: "var(--admin-text)",
        }}>
        {options.map((opt) => (
          <option key={opt.id ?? "root"} value={opt.id ?? ""}>
            {"— ".repeat(Math.max(0, opt.depth - 1))}
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function LibraryTab({
  folderId,
  folderOptions,
  onFolderChange,
  assets,
  loading,
  imageOnly,
  onSelect,
}: {
  folderId: number | null;
  folderOptions: FolderOption[];
  onFolderChange: (id: number | null) => void;
  assets: MediaAsset[];
  loading: boolean;
  imageOnly?: boolean;
  onSelect: (asset: MediaAsset) => void;
}) {
  const t = useTranslations("admin.content.media.picker");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <FolderSelect
          value={folderId}
          options={folderOptions}
          onChange={onFolderChange}
          label={t("folderLabel")}
        />
        {loading && (
          <Loader2
            className="w-4 h-4 animate-spin"
            style={{ color: "var(--admin-text-muted)" }}
          />
        )}
      </div>

      {assets.length === 0 ? (
        <div
          className="rounded-lg border-dashed border-2 p-10 text-center text-sm"
          style={{
            borderColor: "var(--admin-card-border)",
            color: "var(--admin-text-muted)",
          }}>
          {imageOnly ? t("emptyImagesOnly") : t("empty")}
        </div>
      ) : (
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {assets.map((asset) => (
            <PickerCard
              key={asset.id}
              asset={asset}
              onClick={() => onSelect(asset)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PickerCard({
  asset,
  onClick,
}: {
  asset: MediaAsset;
  onClick: () => void;
}) {
  const isImage = asset.mime.startsWith("image/");
  return (
    <button
      type="button"
      onClick={onClick}
      className="group rounded-lg overflow-hidden border text-left hover:shadow-md transition-shadow"
      style={{
        borderColor: "var(--admin-card-border)",
        background: "var(--admin-card-bg)",
      }}>
      <div className="aspect-square flex items-center justify-center relative bg-black/5 dark:bg-white/5">
        {isImage ? (
          <PickerThumb asset={asset} />
        ) : (
          <FileText
            className="w-10 h-10"
            style={{ color: "var(--admin-text-muted)" }}
          />
        )}
      </div>
      <div className="p-2">
        <p
          className="text-xs truncate"
          style={{ color: "var(--admin-text)" }}
          title={asset.filename}>
          {asset.filename}
        </p>
      </div>
    </button>
  );
}

function PickerThumb({ asset }: { asset: MediaAsset }) {
  if (asset.mime === "image/svg+xml") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={asset.publicUrl}
        alt={asset.altText ?? asset.filename}
        className="max-w-full max-h-full object-contain"
      />
    );
  }
  const props = getOptimizedImageProps(asset.publicUrl, { width: 240, quality: 75 });
  return (
    <Image
      src={props.src}
      alt={asset.altText ?? asset.filename}
      width={240}
      height={240}
      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 200px"
      className="w-full h-full object-cover"
      unoptimized={props.unoptimized}
    />
  );
}

function UploadTab({
  folderId,
  folderOptions,
  onFolderChange,
  imageOnly,
  onUploaded,
  error,
  setError,
}: {
  folderId: number | null;
  folderOptions: FolderOption[];
  onFolderChange: (id: number | null) => void;
  imageOnly?: boolean;
  onUploaded: (asset: PickedAsset) => void;
  error: string | null;
  setError: (msg: string | null) => void;
}) {
  const t = useTranslations("admin.content.media.picker");
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  async function handleUpload(file: File) {
    // Pre-check client-side: scarta subito file troppo grossi o di mime non
    // ammessi senza round-trip al server. Il check server resta autoritativo,
    // qui è solo UX.
    if (!isAllowedMime(file.type)) {
      setError(t("rejectedMime", { name: file.name }));
      return;
    }
    if (file.size > MEDIA_MAX_BYTES) {
      setError(t("rejectedSize", { name: file.name, maxMb: MEDIA_MAX_MB_HINT }));
      return;
    }

    setUploading(true);
    setProgress(0);
    setError(null);
    try {
      // Step 1: ticket
      const ticket = await createMediaUploadTicketAction({
        filename: file.name,
        mime: file.type,
        size: file.size,
        folderId,
      });
      if (!ticket.ok) {
        setError(ticket.error);
        return;
      }

      // Step 2: TUS PUT diretto al bucket (resumable + progress reali)
      try {
        await runTusUpload(file, ticket, {
          onProgress: setProgress,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "upload_failed";
        setError(msg);
        return;
      }

      // Step 3: confirm server-side (verifica + sanitize SVG)
      const confirm = await confirmMediaUploadAction({
        assetId: ticket.assetId,
      });
      if (!confirm.ok) {
        setError(confirm.error);
        return;
      }

      startTransition(() => {
        onUploaded({
          id: confirm.asset.id,
          publicUrl: confirm.asset.publicUrl,
          filename: confirm.asset.filename,
          mime: confirm.asset.mime,
        });
      });
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }

  const accept = imageOnly
    ? "image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
    : "image/jpeg,image/png,image/webp,image/gif,image/svg+xml,application/pdf,video/mp4,video/webm";

  return (
    <div className="space-y-4">
      <FolderSelect
        value={folderId}
        options={folderOptions}
        onChange={onFolderChange}
        label={t("uploadFolderLabel")}
      />

      <button
        type="button"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        className="w-full rounded-lg border-dashed border-2 p-10 flex flex-col items-center justify-center gap-2 hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-60"
        style={{ borderColor: "var(--admin-card-border)" }}>
        {uploading ? (
          <Loader2
            className="w-8 h-8 animate-spin"
            style={{ color: "var(--admin-text-muted)" }}
          />
        ) : (
          <Upload
            className="w-8 h-8"
            style={{ color: "var(--admin-text-muted)" }}
          />
        )}
        <span
          className="text-sm"
          style={{ color: "var(--admin-text-muted)" }}>
          {uploading
            ? t("uploading")
            : t("uploadHint", { maxMb: MEDIA_MAX_MB_HINT })}
        </span>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleUpload(file);
          e.target.value = ""; // reset to allow re-pick same file
        }}
      />

      {error && (
        <p className="text-sm rounded-md p-3" style={{ background: "rgba(220, 38, 38, 0.1)", color: "#dc2626" }}>
          {error}
        </p>
      )}

      {uploading && <PickerUploadOverlay progress={progress} />}
    </div>
  );
}

function PickerUploadOverlay({ progress }: { progress: number }) {
  const t = useTranslations("admin.content.media.uploader");
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      role="alert"
      aria-busy="true">
      <div
        className="rounded-xl px-6 py-5 shadow-xl flex items-center gap-4 min-w-[320px]"
        style={{
          background: "var(--admin-card-bg)",
          border: "1px solid var(--admin-card-border)",
        }}>
        <Loader2
          className="w-6 h-6 animate-spin flex-shrink-0"
          style={{ color: "var(--admin-accent)" }}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3">
            <p
              className="text-sm font-medium"
              style={{ color: "var(--admin-text)" }}>
              {t("overlayUploading")}
            </p>
            <span
              className="text-xs font-mono"
              style={{ color: "var(--admin-text-muted)" }}>
              {progress >= 100 ? "…" : `${progress}%`}
            </span>
          </div>
          <div
            className="mt-2 h-1.5 rounded-full overflow-hidden"
            style={{ background: "var(--admin-page-bg)" }}>
            <div
              className="h-full transition-[width] duration-150"
              style={{
                width: `${progress}%`,
                background: "var(--admin-accent)",
              }}
            />
          </div>
          <p
            className="text-xs mt-1.5"
            style={{ color: "var(--admin-text-muted)" }}>
            {t("overlayHint")}
          </p>
        </div>
      </div>
    </div>
  );
}

