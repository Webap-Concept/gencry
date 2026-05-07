"use client";

import { AdminToast } from "@/app/(admin)/admin/_components/toast";
import { Loader2, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { uploadMediaAssets, type ActionState } from "../actions";
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

export function MediaUploader({
  currentFolderId,
}: {
  currentFolderId: number | null;
}) {
  const t = useTranslations("admin.content.media.uploader");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const [uploadingCount, setUploadingCount] = useState(0);

  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    uploadMediaAssets,
    {},
  );

  useEffect(() => {
    if ("success" in state) {
      setToast({ message: state.success, type: "success" });
      formRef.current?.reset();
      setUploadingCount(0);
      router.refresh();
    } else if ("error" in state) {
      setToast({ message: state.error, type: "error" });
      setUploadingCount(0);
    }
  }, [state, router]);

  return (
    <>
      <form ref={formRef} action={formAction}>
        <input type="hidden" name="folderId" value={currentFolderId ?? ""} />
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
              opacity: isPending ? 0.6 : 1,
              pointerEvents: isPending ? "none" : "auto",
            }}>
            {isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            {isPending ? t("uploading") : t("button")}
            <input
              ref={inputRef}
              type="file"
              name="files"
              accept={ACCEPT}
              multiple
              className="hidden"
              disabled={isPending}
              onChange={(e) => {
                const files = e.target.files;
                if (files && files.length > 0) {
                  setUploadingCount(files.length);
                  formRef.current?.requestSubmit();
                }
              }}
            />
          </label>
        </div>
      </form>

      {isPending && <UploadOverlay count={uploadingCount} />}

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
 * Overlay fisso a tutto schermo durante l'upload. Le server actions non
 * espongono il progress in byte (a differenza di XHR), quindi il feedback
 * è "in corso" + count file. Blocca l'interazione finché l'azione non
 * conclude — evita che l'admin pensi che sia bloccata.
 */
function UploadOverlay({ count }: { count: number }) {
  const t = useTranslations("admin.content.media.uploader");
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      role="alert"
      aria-busy="true">
      <div
        className="rounded-xl px-6 py-5 shadow-xl flex items-center gap-4 min-w-[280px]"
        style={{
          background: "var(--admin-card-bg)",
          border: "1px solid var(--admin-card-border)",
        }}>
        <Loader2
          className="w-6 h-6 animate-spin flex-shrink-0"
          style={{ color: "var(--admin-accent)" }}
        />
        <div>
          <p
            className="text-sm font-medium"
            style={{ color: "var(--admin-text)" }}>
            {count > 1
              ? t("overlayUploadingMany", { count })
              : t("overlayUploading")}
          </p>
          <p
            className="text-xs mt-0.5"
            style={{ color: "var(--admin-text-muted)" }}>
            {t("overlayHint")}
          </p>
        </div>
      </div>
    </div>
  );
}
