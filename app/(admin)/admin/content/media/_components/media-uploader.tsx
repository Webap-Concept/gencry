"use client";

import { AdminToast } from "@/app/(admin)/admin/_components/toast";
import { Loader2, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
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
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    uploadMediaAssets,
    {},
  );

  useEffect(() => {
    if ("success" in state) {
      setToast({ message: state.success, type: "success" });
      formRef.current?.reset();
    } else if ("error" in state) {
      setToast({ message: state.error, type: "error" });
    }
  }, [state]);

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
                if (e.target.files && e.target.files.length > 0) {
                  formRef.current?.requestSubmit();
                }
              }}
            />
          </label>
        </div>
      </form>

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
