"use client";

import { buildOptimizedImageAttrs } from "@/lib/storage/image-optimizer";
import { IMAGE_PRESETS } from "@/lib/storage/image-widths";
import { FileText, ImagePlus, Loader2, Pencil, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { getMediaAssetPreview } from "../actions";
import { MediaPicker, type PickedAsset } from "./media-picker";

interface MediaPickerFieldProps {
  /** Valore corrente: stringa che rappresenta o un media_asset_id (numerico)
   *  o un URL legacy/esterno. Stringa vuota = nessuna selezione. */
  value: string;
  onChange: (value: string) => void;
  /** Quando true mostra solo immagini nel picker. */
  imageOnly?: boolean;
  placeholder?: string;
}

interface PreviewState {
  /** Cosa mostrare nel preview */
  kind: "asset" | "url" | "empty";
  asset?: { id: number; publicUrl: string; filename: string; mime: string };
  url?: string;
}

/**
 * Wrapper per i campi `image` dei custom field di un template. Mostra preview
 * dell'asset selezionato + bottoni Change/Remove. Click su Change apre il
 * MediaPicker dialog.
 *
 * Il valore esposto a `onChange` è sempre stringa:
 *   - id numerico (es. "42") quando l'utente sceglie un asset dalla libreria
 *     o lo carica via picker
 *   - URL diretto se l'utente passa una stringa esterna (legacy / paste)
 *   - "" quando rimuove
 */
export function MediaPickerField({
  value,
  onChange,
  imageOnly,
  placeholder,
}: MediaPickerFieldProps) {
  const t = useTranslations("admin.content.media.pickerField");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [preview, setPreview] = useState<PreviewState>({ kind: "empty" });
  const [loadingPreview, setLoadingPreview] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const trimmed = value.trim();
      if (!trimmed) {
        setPreview({ kind: "empty" });
        return;
      }
      // Numero positivo intero → assetId
      const n = Number(trimmed);
      if (Number.isInteger(n) && n > 0 && String(n) === trimmed) {
        setLoadingPreview(true);
        try {
          const asset = await getMediaAssetPreview(n);
          if (cancelled) return;
          if (asset) {
            setPreview({ kind: "asset", asset });
          } else {
            // asset orfano (cancellato dopo il salvataggio)
            setPreview({ kind: "empty" });
          }
        } finally {
          if (!cancelled) setLoadingPreview(false);
        }
        return;
      }
      // Stringa non numerica → URL legacy/esterno
      setPreview({ kind: "url", url: trimmed });
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [value]);

  function handleSelect(asset: PickedAsset) {
    onChange(String(asset.id));
  }

  function handleRemove() {
    onChange("");
  }

  return (
    <>
      <div
        className="rounded-lg p-3"
        style={{
          background: "var(--admin-page-bg, var(--admin-card-bg))",
          border: "1px solid var(--admin-input-border, var(--admin-card-border))",
        }}>
        {preview.kind === "empty" ? (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="w-full flex items-center justify-center gap-2 py-6 rounded-md border-dashed border-2 hover:bg-black/5 dark:hover:bg-white/5"
            style={{
              borderColor: "var(--admin-card-border)",
              color: "var(--admin-text-muted)",
            }}>
            <ImagePlus className="w-5 h-5" />
            <span className="text-sm">{placeholder ?? t("pickButton")}</span>
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <div
              className="h-20 w-auto max-w-40 rounded-md overflow-hidden flex items-center justify-center flex-shrink-0"
              style={{
                background: "var(--admin-card-bg)",
                border: "1px solid var(--admin-card-border)",
                // min-width: in stato loading o per icone non-immagine, evita
                // un container collassato in larghezza zero.
                minWidth: "5rem",
              }}>
              {loadingPreview ? (
                <Loader2
                  className="w-5 h-5 animate-spin"
                  style={{ color: "var(--admin-text-muted)" }}
                />
              ) : preview.kind === "asset" ? (
                <AssetPreviewThumb asset={preview.asset!} />
              ) : (
                <UrlPreviewThumb url={preview.url!} />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <p
                className="text-sm font-medium truncate"
                style={{ color: "var(--admin-text)" }}
                title={
                  preview.kind === "asset"
                    ? preview.asset!.filename
                    : preview.url
                }>
                {preview.kind === "asset" ? preview.asset!.filename : preview.url}
              </p>
              <p
                className="text-xs"
                style={{ color: "var(--admin-text-muted)" }}>
                {preview.kind === "asset" ? t("sourceLibrary") : t("sourceUrl")}
              </p>
            </div>

            <div className="flex gap-1 flex-shrink-0">
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="p-2 rounded-md hover:bg-black/5 dark:hover:bg-white/5"
                style={{ color: "var(--admin-text-muted)" }}
                aria-label={t("change")}
                title={t("change")}>
                <Pencil className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleRemove}
                className="p-2 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20"
                style={{ color: "#dc2626" }}
                aria-label={t("remove")}
                title={t("remove")}>
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      <MediaPicker
        open={pickerOpen}
        imageOnly={imageOnly}
        onClose={() => setPickerOpen(false)}
        onSelect={handleSelect}
      />
    </>
  );
}

function AssetPreviewThumb({
  asset,
}: {
  asset: { id: number; publicUrl: string; filename: string; mime: string };
}) {
  if (asset.mime.startsWith("image/")) {
    // Niente Next/Image: vogliamo width auto basata sull'aspect ratio reale
    // dell'immagine (Next/Image impone l'aspect ratio dei width/height passati).
    // Per immagini larghe il browser scala in width fino al max-w del container,
    // mantenendo h-full. SVG non passa per /_next/image (Vercel rifiuta SVG).
    if (asset.mime === "image/svg+xml") {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={asset.publicUrl}
          alt={asset.filename}
          className="h-full w-auto max-w-full object-contain"
        />
      );
    }
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        {...buildOptimizedImageAttrs(asset.publicUrl, IMAGE_PRESETS.adminPreview)}
        alt={asset.filename}
        className="h-full w-auto max-w-full object-contain"
      />
    );
  }
  return (
    <FileText
      className="w-6 h-6"
      style={{ color: "var(--admin-text-muted)" }}
    />
  );
}

function UrlPreviewThumb({ url }: { url: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      className="h-full w-auto max-w-full object-contain"
      onError={(e) => {
        // Asset URL rotto: nascondi e mostra placeholder
        (e.target as HTMLImageElement).style.display = "none";
      }}
    />
  );
}
