"use client";
// app/(admin)/admin/_components/admin-avatar-crop-dialog.tsx
//
// Versione admin del dialog di crop avatar. STESSA logica di
// app/(protected)/settings/profile/_components/avatar-crop-dialog.tsx
// (Cropper 1:1 + canvas helpers → JPEG 512×512), MA renderizzata con
// `<AdminDialog>` + `<AdminButton>` per rispettare la regola
// feedback_admin_no_frontend_css ("admin usa SOLO --admin-* tokens,
// mai classi gc-*").
//
// Logica canvas (loadImage / getCroppedFile) duplicata invece di
// importata: e' puro DOM/Canvas, niente styling. Tenerla locale evita
// di cross-importare dal (protected) tree, che e' un altro caveat
// della memory module-isolation.
import {
  AdminDialog,
  AdminDialogCancelButton,
  AdminDialogConfirmButton,
  AdminDialogContent,
} from "./admin-dialog";
import Cropper, { type Area } from "react-easy-crop";
import { Crop, Loader2, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

const OUTPUT_SIZE = 512;
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

export type AdminAvatarCropDialogProps = {
  open: boolean;
  imageSrc: string | null;
  saving?: boolean;
  onCancel: () => void;
  onConfirm: (file: File) => void;
};

export function AdminAvatarCropDialog({
  open,
  imageSrc,
  saving = false,
  onCancel,
  onConfirm,
}: AdminAvatarCropDialogProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state al ri-apertura con nuova immagine
  useEffect(() => {
    if (open) {
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
      setError(null);
    }
  }, [open, imageSrc]);

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

  const busy = processing || saving;

  return (
    <AdminDialog
      open={open && imageSrc !== null}
      onOpenChange={(o) => {
        if (!o && !busy) onCancel();
      }}>
      <AdminDialogContent
        icon={Crop}
        size="md"
        title="Ritaglia foto profilo"
        description="Trascina per spostare, usa slider o rotella per lo zoom."
        footer={
          <>
            <AdminDialogCancelButton onClick={onCancel} disabled={busy}>
              Annulla
            </AdminDialogCancelButton>
            <AdminDialogConfirmButton
              onClick={handleConfirm}
              disabled={busy || !croppedAreaPixels}
              loading={busy}>
              {saving ? "Caricamento…" : processing ? "Elaborazione…" : "Salva foto"}
            </AdminDialogConfirmButton>
          </>
        }>
        {/* Cropper area — quadrata, sfondo nero per ritaglio circolare */}
        <div className="relative w-full aspect-square rounded-lg overflow-hidden bg-black">
          {imageSrc ? (
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
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2
                size={20}
                className="animate-spin"
                style={{ color: "var(--admin-text-faint)" }}
              />
            </div>
          )}
        </div>

        {/* Zoom slider */}
        <div className="flex items-center gap-3 mt-3">
          <button
            type="button"
            onClick={() =>
              setZoom((z) => Math.max(MIN_ZOOM, +(z - 0.1).toFixed(2)))
            }
            disabled={busy || zoom <= MIN_ZOOM}
            aria-label="Riduci zoom"
            className="flex items-center justify-center w-7 h-7 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ color: "var(--admin-text-muted)" }}>
            <ZoomOut size={15} />
          </button>
          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            disabled={busy}
            aria-label="Zoom"
            className="flex-1"
            style={{ accentColor: "var(--admin-accent)" }}
          />
          <button
            type="button"
            onClick={() =>
              setZoom((z) => Math.min(MAX_ZOOM, +(z + 0.1).toFixed(2)))
            }
            disabled={busy || zoom >= MAX_ZOOM}
            aria-label="Aumenta zoom"
            className="flex items-center justify-center w-7 h-7 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ color: "var(--admin-text-muted)" }}>
            <ZoomIn size={15} />
          </button>
        </div>

        {error ? (
          <p
            className="text-[12px] mt-2"
            style={{ color: "var(--gc-neg, #dc2626)" }}
            role="alert">
            {error}
          </p>
        ) : null}
      </AdminDialogContent>
    </AdminDialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Canvas helpers — puro DOM, nessun styling. Duplicati dal flow user
// per evitare cross-import dal (protected) tree.
// ─────────────────────────────────────────────────────────────────────────

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
