"use client";

import { AdminToast } from "@/app/(admin)/admin/_components/toast";
import type { MediaAsset, MediaFolder } from "@/lib/db/media-queries";
import { getOptimizedImageProps } from "@/lib/storage/image-optimizer";
import {
  ChevronRight,
  FileText,
  Film,
  FolderInput,
  Loader2,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import {
  deleteMediaAsset,
  moveMediaAsset,
  type ActionState,
} from "../actions";

interface MediaGridProps {
  assets: MediaAsset[];
  folders: MediaFolder[];
}

interface FolderOption {
  id: number | null;
  label: string;
  depth: number;
}

/**
 * Costruisce la flat list di folder per il menu "Move to...". Ogni folder è
 * preceduto dai suoi antenati (depth ne indica il livello). Root sempre in
 * cima. Ordine alfabetico per livello.
 */
function flattenFolders(folders: MediaFolder[]): FolderOption[] {
  const byParent = new Map<number | null, MediaFolder[]>();
  for (const f of folders) {
    const list = byParent.get(f.parentId) ?? [];
    list.push(f);
    byParent.set(f.parentId, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }

  const out: FolderOption[] = [];
  const walk = (parentId: number | null, depth: number) => {
    const children = byParent.get(parentId) ?? [];
    for (const c of children) {
      out.push({ id: c.id, label: c.name, depth });
      walk(c.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

export function MediaGrid({ assets, folders }: MediaGridProps) {
  const t = useTranslations("admin.content.media.grid");
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [moveAssetId, setMoveAssetId] = useState<number | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const [delState, deleteAction, deletePending] = useActionState<
    ActionState,
    FormData
  >(deleteMediaAsset, {});
  const [moveState, moveAction, movePending] = useActionState<
    ActionState,
    FormData
  >(moveMediaAsset, {});

  useEffect(() => {
    if ("success" in delState) {
      setToast({ message: delState.success, type: "success" });
      setConfirmId(null);
    } else if ("error" in delState) {
      setToast({ message: delState.error, type: "error" });
    }
  }, [delState]);

  useEffect(() => {
    if ("success" in moveState) {
      setToast({ message: moveState.success, type: "success" });
      setMoveAssetId(null);
    } else if ("error" in moveState) {
      setToast({ message: moveState.error, type: "error" });
    }
  }, [moveState]);

  const folderOptions = useMemo(() => flattenFolders(folders), [folders]);

  if (assets.length === 0) {
    return (
      <div
        className="rounded-lg border-dashed border-2 p-10 text-center"
        style={{ borderColor: "var(--admin-card-border)" }}>
        <p style={{ color: "var(--admin-text-muted)" }}>{t("empty")}</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {assets.map((asset) => (
          <AssetCard
            key={asset.id}
            asset={asset}
            onDelete={() => setConfirmId(asset.id)}
            onMove={() => setMoveAssetId(asset.id)}
          />
        ))}
      </div>

      {confirmId !== null && (
        <ConfirmDeleteDialog
          asset={assets.find((a) => a.id === confirmId)!}
          isPending={deletePending}
          onCancel={() => setConfirmId(null)}
          formAction={deleteAction}
        />
      )}

      {moveAssetId !== null && (
        <MoveAssetDialog
          asset={assets.find((a) => a.id === moveAssetId)!}
          folderOptions={folderOptions}
          isPending={movePending}
          onCancel={() => setMoveAssetId(null)}
          formAction={moveAction}
        />
      )}

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

function AssetCard({
  asset,
  onDelete,
  onMove,
}: {
  asset: MediaAsset;
  onDelete: () => void;
  onMove: () => void;
}) {
  const t = useTranslations("admin.content.media.grid");
  const isImage = asset.mime.startsWith("image/");
  const isVideo = asset.mime.startsWith("video/");

  return (
    <div
      className="group rounded-lg overflow-hidden relative border"
      style={{
        borderColor: "var(--admin-card-border)",
        background: "var(--admin-card-bg-secondary, var(--admin-card-bg))",
      }}>
      <div className="aspect-square flex items-center justify-center relative bg-black/5 dark:bg-white/5">
        {isImage ? <ImageThumb asset={asset} /> : <NonImageThumb mime={asset.mime} />}

        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={onMove}
            aria-label={t("moveAria")}
            className="p-1.5 rounded-md bg-black/60 text-white hover:bg-black/80">
            <FolderInput className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label={t("deleteAria")}
            className="p-1.5 rounded-md bg-black/60 text-white hover:bg-red-600">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="p-2">
        <p
          className="text-xs truncate"
          style={{ color: "var(--admin-text)" }}
          title={asset.filename}>
          {asset.filename}
        </p>
        <p
          className="text-[11px]"
          style={{ color: "var(--admin-text-muted)" }}>
          {formatSize(asset.sizeBytes)}
          {isVideo ? ` · ${t("typeVideo")}` : ""}
        </p>
      </div>
    </div>
  );
}

function ImageThumb({ asset }: { asset: MediaAsset }) {
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
  const props = getOptimizedImageProps(asset.publicUrl, { width: 320, quality: 75 });
  return (
    <Image
      src={props.src}
      alt={asset.altText ?? asset.filename}
      width={320}
      height={320}
      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 200px"
      className="w-full h-full object-cover"
      unoptimized={props.unoptimized}
    />
  );
}

function NonImageThumb({ mime }: { mime: string }) {
  const Icon = mime.startsWith("video/") ? Film : FileText;
  return (
    <Icon
      className="w-10 h-10"
      style={{ color: "var(--admin-text-muted)" }}
    />
  );
}

function ConfirmDeleteDialog({
  asset,
  isPending,
  onCancel,
  formAction,
}: {
  asset: MediaAsset;
  isPending: boolean;
  onCancel: () => void;
  formAction: (formData: FormData) => void;
}) {
  const t = useTranslations("admin.content.media.grid.delete");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onCancel}>
      <div
        className="rounded-xl p-6 max-w-md w-full shadow-xl"
        style={{
          background: "var(--admin-card-bg)",
          border: "1px solid var(--admin-card-border)",
        }}
        onClick={(e) => e.stopPropagation()}>
        <h3
          className="text-base font-semibold mb-2"
          style={{ color: "var(--admin-text)" }}>
          {t("title")}
        </h3>
        <p
          className="text-sm mb-1"
          style={{ color: "var(--admin-text-muted)" }}>
          {t("body", { name: asset.filename })}
        </p>
        <p
          className="text-sm mb-5"
          style={{ color: "var(--admin-text-muted)" }}>
          {t("warning")}
        </p>

        <form action={formAction} className="flex justify-end gap-2">
          <input type="hidden" name="id" value={asset.id} />
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="px-4 py-2 rounded-lg text-sm font-medium border"
            style={{
              borderColor: "var(--admin-card-border)",
              color: "var(--admin-text)",
            }}>
            {t("cancel")}
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-700 inline-flex items-center gap-2 disabled:opacity-60">
            {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            {t("confirm")}
          </button>
        </form>
      </div>
    </div>
  );
}

function MoveAssetDialog({
  asset,
  folderOptions,
  isPending,
  onCancel,
  formAction,
}: {
  asset: MediaAsset;
  folderOptions: FolderOption[];
  isPending: boolean;
  onCancel: () => void;
  formAction: (formData: FormData) => void;
}) {
  const t = useTranslations("admin.content.media.grid.move");
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(
    asset.folderId,
  );
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onCancel}>
      <div
        className="rounded-xl p-6 max-w-md w-full shadow-xl"
        style={{
          background: "var(--admin-card-bg)",
          border: "1px solid var(--admin-card-border)",
        }}
        onClick={(e) => e.stopPropagation()}>
        <h3
          className="text-base font-semibold mb-1"
          style={{ color: "var(--admin-text)" }}>
          {t("title")}
        </h3>
        <p className="text-sm mb-4" style={{ color: "var(--admin-text-muted)" }}>
          {t("body", { name: asset.filename })}
        </p>

        <form ref={formRef} action={formAction} className="space-y-4">
          <input type="hidden" name="assetId" value={asset.id} />
          <input
            type="hidden"
            name="folderId"
            value={selectedFolderId ?? ""}
          />

          <div
            className="rounded-md max-h-72 overflow-y-auto"
            style={{ border: "1px solid var(--admin-card-border)" }}>
            <FolderRadio
              label={t("root")}
              checked={selectedFolderId === null}
              onClick={() => setSelectedFolderId(null)}
              depth={0}
            />
            {folderOptions.map((opt) => (
              <FolderRadio
                key={opt.id ?? "root"}
                label={opt.label}
                depth={opt.depth + 1}
                checked={selectedFolderId === opt.id}
                onClick={() => setSelectedFolderId(opt.id)}
              />
            ))}
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={isPending}
              className="px-4 py-2 rounded-lg text-sm font-medium border"
              style={{
                borderColor: "var(--admin-card-border)",
                color: "var(--admin-text)",
              }}>
              {t("cancel")}
            </button>
            <button
              type="submit"
              disabled={isPending || selectedFolderId === asset.folderId}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white inline-flex items-center gap-2 disabled:opacity-60"
              style={{ background: "var(--admin-accent)" }}>
              {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {t("confirm")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function FolderRadio({
  label,
  depth,
  checked,
  onClick,
}: {
  label: string;
  depth: number;
  checked: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5 border-b last:border-b-0"
      style={{
        borderColor: "var(--admin-card-border)",
        background: checked ? "var(--admin-accent-soft, rgba(0,0,0,0.05))" : "transparent",
        paddingLeft: `${12 + depth * 12}px`,
        color: checked ? "var(--admin-accent)" : "var(--admin-text)",
      }}>
      {depth > 0 && (
        <ChevronRight
          className="w-3 h-3"
          style={{ color: "var(--admin-text-muted)" }}
        />
      )}
      <span>{label}</span>
    </button>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
