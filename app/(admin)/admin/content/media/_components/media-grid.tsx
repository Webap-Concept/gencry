"use client";

import { AdminToast } from "@/app/(admin)/admin/_components/toast";
import type { MediaAsset } from "@/lib/db/media-queries";
import { getOptimizedImageProps } from "@/lib/storage/image-optimizer";
import { FileText, Film, Loader2, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useActionState, useEffect, useState } from "react";
import { deleteMediaAsset, type ActionState } from "../actions";

interface MediaGridProps {
  assets: MediaAsset[];
}

export function MediaGrid({ assets }: MediaGridProps) {
  const t = useTranslations("admin.content.media.grid");
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    deleteMediaAsset,
    {},
  );

  useEffect(() => {
    if ("success" in state) {
      setToast({ message: state.success, type: "success" });
      setConfirmId(null);
    } else if ("error" in state) {
      setToast({ message: state.error, type: "error" });
    }
  }, [state]);

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
          />
        ))}
      </div>

      {confirmId !== null && (
        <ConfirmDeleteDialog
          asset={assets.find((a) => a.id === confirmId)!}
          isPending={isPending}
          onCancel={() => setConfirmId(null)}
          formAction={formAction}
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
}: {
  asset: MediaAsset;
  onDelete: () => void;
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

        <button
          type="button"
          onClick={onDelete}
          aria-label={t("deleteAria")}
          className="absolute top-2 right-2 p-1.5 rounded-md bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
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
    // SVG: serviamo originale, no optimization
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

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
