"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Cropper, { type Area } from "react-easy-crop";
import { Loader2, X, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";

const OUTPUT_SIZE = 512;
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

export type AvatarCropDialogProps = {
  open: boolean;
  imageSrc: string | null;
  saving?: boolean;
  onCancel: () => void;
  onConfirm: (file: File) => void;
};

export function AvatarCropDialog({
  open,
  imageSrc,
  saving = false,
  onCancel,
  onConfirm,
}: AvatarCropDialogProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state quando il dialog si apre con una nuova immagine
  useEffect(() => {
    if (open) {
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
      setError(null);
    }
  }, [open, imageSrc]);

  // Chiudi con Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !processing && !saving) onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel, processing, saving]);

  const onCropComplete = useCallback((_area: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  async function handleConfirm() {
    if (!imageSrc || !croppedAreaPixels) return;
    setError(null);
    setProcessing(true);
    try {
      const file = await getCroppedFile(imageSrc, croppedAreaPixels, OUTPUT_SIZE);
      onConfirm(file);
    } catch (err) {
      console.error(err);
      setError("Impossibile elaborare l'immagine. Riprova.");
    } finally {
      setProcessing(false);
    }
  }

  if (!open || !imageSrc) return null;

  const busy = processing || saving;

  return createPortal(
    <>
      <div
        onClick={busy ? undefined : onCancel}
        className="fixed inset-0 z-[10000] bg-black/50 backdrop-blur-[2px]"
        style={{ animation: "acd-fade-in 140ms ease" }}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="acd-title"
        className="fixed inset-0 z-[10001] flex items-center justify-center p-4 pointer-events-none"
      >
        <div
          className="bg-brand-surface-card border border-brand-border rounded-2xl shadow-2xl w-full max-w-md pointer-events-auto overflow-hidden"
          style={{ animation: "acd-slide-up 160ms cubic-bezier(0.16,1,0.3,1)" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-gc-line">
            <h2 id="acd-title" className="text-[14px] font-semibold text-gc-fg m-0">
              Ritaglia foto profilo
            </h2>
            <button
              onClick={onCancel}
              disabled={busy}
              className="flex items-center justify-center w-7 h-7 rounded-md text-gc-fg-3 hover:bg-gc-bg-3 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              aria-label="Chiudi"
            >
              <X size={15} />
            </button>
          </div>

          {/* Cropper area */}
          <div className="relative w-full aspect-square bg-black">
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              showGrid={false}
              minZoom={MIN_ZOOM}
              maxZoom={MAX_ZOOM}
              restrictPosition
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          </div>

          {/* Zoom slider */}
          <div className="flex items-center gap-3 px-5 py-3 border-t border-gc-line">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(MIN_ZOOM, +(z - 0.1).toFixed(2)))}
              disabled={busy || zoom <= MIN_ZOOM}
              className="text-gc-fg-3 hover:text-gc-fg disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Riduci zoom"
            >
              <ZoomOut size={16} />
            </button>
            <input
              type="range"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              disabled={busy}
              className="flex-1 accent-[var(--brand-border-focus)]"
              aria-label="Zoom"
            />
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(MAX_ZOOM, +(z + 0.1).toFixed(2)))}
              disabled={busy || zoom >= MAX_ZOOM}
              className="text-gc-fg-3 hover:text-gc-fg disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Aumenta zoom"
            >
              <ZoomIn size={16} />
            </button>
          </div>

          {/* Footer */}
          <div className="flex flex-col gap-2 px-5 py-4 border-t border-gc-line">
            {error && <p className="text-[12.5px] text-gc-neg">{error}</p>}
            <p className="text-[11.5px] text-gc-fg-3">
              Trascina l&apos;immagine per spostarla, usa lo slider o la rotella per lo zoom.
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
                Annulla
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleConfirm}
                disabled={busy || !croppedAreaPixels}
              >
                {busy && <Loader2 size={14} className="animate-spin" />}
                {saving ? "Caricamento…" : processing ? "Elaborazione…" : "Salva foto"}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes acd-fade-in  { from { opacity: 0 } to { opacity: 1 } }
        @keyframes acd-slide-up { from { opacity: 0; transform: translateY(10px) scale(0.97) } to { opacity: 1; transform: translateY(0) scale(1) } }
      `}</style>
    </>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Canvas helpers
// ---------------------------------------------------------------------------

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("img-load"));
    img.src = src;
  });
}

async function getCroppedFile(
  imageSrc: string,
  pixelCrop: Area,
  outputSize: number,
): Promise<File> {
  const image = await loadImage(imageSrc);
  const canvas = document.createElement("canvas");
  canvas.width = outputSize;
  canvas.height = outputSize;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no-canvas-ctx");

  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    outputSize,
    outputSize,
  );

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.92),
  );
  if (!blob) throw new Error("no-blob");
  return new File([blob], "avatar.jpg", { type: "image/jpeg" });
}
