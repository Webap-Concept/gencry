"use client";
// components/modules/posts/MediaUploader.tsx
//
// Drag&drop + file picker per attaccare immagini al post in composer.
// Upload sequenziale (max 4 file) verso R2 via signed PUT URL:
//
//   1. createPostMediaTicket()  → { assetId, putUrl }
//   2. XHR PUT putUrl con file  → progress events per la UI
//   3. confirmPostMediaUpload() → server processa con sharp, ritorna
//                                  fullUrl + thumbUrl
//   4. status=ready, l'item è "claimable" al publish del post
//
// L'array `mediaIds` (assetId dei ready) viene passato al parent via
// onChange — il Composer lo invia a createPost dentro mediaIds[].
//
// Cleanup automatico: l'item dismiss (X) chiama deletePostMediaDraft.
// Lo unmount del componente fa cleanup di TUTTI i draft non ancora
// claim-ati (utile su modal close senza submit).
import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import {
  confirmPostMediaUpload,
  createPostMediaTicket,
  deletePostMediaDraft,
} from "@/lib/modules/posts/media-actions";

type Status = "uploading" | "processing" | "ready" | "error";

type UploadItem = {
  localId: string;          // chiave React stabile lato client
  file: File;
  status: Status;
  progress: number;         // 0..100 (upload phase)
  assetId?: string;
  thumbUrl?: string;         // disponibile dopo confirm
  fullUrl?: string;
  error?: string;
};

const MAX_FILES = 4;
const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp"] as const;

type Props = {
  /** Callback: array di assetId per i media confirmed/ready. */
  onMediaIdsChange: (ids: string[]) => void;
  disabled?: boolean;
};

export function MediaUploader({ onMediaIdsChange, disabled }: Props) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Snapshot stabile usato dal cleanup-on-unmount per evitare stale closure.
  const itemsRef = useRef<UploadItem[]>([]);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // Cleanup on unmount: cancella draft non claim-ati (best-effort).
  useEffect(() => {
    return () => {
      for (const it of itemsRef.current) {
        if (it.assetId) {
          void deletePostMediaDraft({ assetId: it.assetId }).catch(() => {});
        }
      }
    };
  }, []);

  // Propaga gli assetId ready al parent.
  useEffect(() => {
    const ids = items
      .filter((i) => i.status === "ready" && i.assetId)
      .map((i) => i.assetId!);
    onMediaIdsChange(ids);
  }, [items, onMediaIdsChange]);

  const pickFiles = () => {
    if (!disabled) inputRef.current?.click();
  };

  const handleFiles = async (filesList: FileList | File[]) => {
    if (disabled) return;
    const incoming = Array.from(filesList);
    const remainingSlots = MAX_FILES - items.length;
    if (remainingSlots <= 0) return;
    const toUpload = incoming.slice(0, remainingSlots);

    const newItems: UploadItem[] = [];
    for (const file of toUpload) {
      if (!(ALLOWED as readonly string[]).includes(file.type)) {
        newItems.push({
          localId: crypto.randomUUID(),
          file,
          status: "error",
          progress: 0,
          error: "Formato non supportato (jpeg/png/webp).",
        });
        continue;
      }
      if (file.size > MAX_BYTES) {
        newItems.push({
          localId: crypto.randomUUID(),
          file,
          status: "error",
          progress: 0,
          error: "Immagine troppo grande (max 8MB).",
        });
        continue;
      }
      newItems.push({
        localId: crypto.randomUUID(),
        file,
        status: "uploading",
        progress: 0,
      });
    }
    setItems((prev) => [...prev, ...newItems]);

    // Upload sequenziale dei nuovi (i precedenti già fatti li skippiamo).
    for (const item of newItems) {
      if (item.status !== "uploading") continue;
      try {
        await uploadSingle(item);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "upload_failed";
        setItems((prev) =>
          prev.map((x) =>
            x.localId === item.localId
              ? { ...x, status: "error", error: msg }
              : x,
          ),
        );
      }
    }
  };

  const uploadSingle = async (item: UploadItem) => {
    // 1) Ticket
    const ticket = await createPostMediaTicket({
      mime: item.file.type as (typeof ALLOWED)[number],
      sizeBytes: item.file.size,
    });
    if (!ticket.ok) {
      setItems((prev) =>
        prev.map((x) =>
          x.localId === item.localId
            ? { ...x, status: "error", error: ticket.error }
            : x,
        ),
      );
      return;
    }
    const { assetId, putUrl } = ticket.data!;
    setItems((prev) =>
      prev.map((x) => (x.localId === item.localId ? { ...x, assetId } : x)),
    );

    // 2) PUT con progress (XHR — fetch non espone progress di upload)
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", putUrl);
      xhr.setRequestHeader("Content-Type", item.file.type);
      xhr.upload.onprogress = (e) => {
        if (!e.lengthComputable) return;
        const progress = Math.round((e.loaded / e.total) * 100);
        setItems((prev) =>
          prev.map((x) =>
            x.localId === item.localId ? { ...x, progress } : x,
          ),
        );
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else reject(new Error(`R2 PUT ${xhr.status}`));
      };
      xhr.onerror = () => reject(new Error("R2 PUT network error"));
      xhr.send(item.file);
    });

    setItems((prev) =>
      prev.map((x) =>
        x.localId === item.localId
          ? { ...x, status: "processing", progress: 100 }
          : x,
      ),
    );

    // 3) Confirm — server scarica, fa sharp resize+exif strip, upload varianti
    const confirmed = await confirmPostMediaUpload({ assetId });
    if (!confirmed.ok) {
      setItems((prev) =>
        prev.map((x) =>
          x.localId === item.localId
            ? { ...x, status: "error", error: confirmed.error }
            : x,
        ),
      );
      return;
    }
    setItems((prev) =>
      prev.map((x) =>
        x.localId === item.localId
          ? {
              ...x,
              status: "ready",
              thumbUrl: confirmed.data!.thumbUrl,
              fullUrl: confirmed.data!.fullUrl,
            }
          : x,
      ),
    );
  };

  const removeItem = (localId: string) => {
    const target = items.find((i) => i.localId === localId);
    if (target?.assetId) {
      void deletePostMediaDraft({ assetId: target.assetId }).catch(() => {});
    }
    setItems((prev) => prev.filter((i) => i.localId !== localId));
  };

  const canAdd = items.length < MAX_FILES && !disabled;

  return (
    <div className="px-5 pb-2">
      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED.join(",")}
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) handleFiles(e.target.files);
          e.target.value = ""; // reset così re-select dello stesso file riparte
        }}
      />

      {items.length > 0 ? (
        <div className="grid grid-cols-4 gap-2 mb-2">
          {items.map((it) => (
            <ItemTile key={it.localId} item={it} onRemove={removeItem} />
          ))}
        </div>
      ) : null}

      {canAdd ? (
        <button
          type="button"
          onClick={pickFiles}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (e.dataTransfer.files) handleFiles(e.dataTransfer.files);
          }}
          className={`w-full flex items-center justify-center gap-2 text-xs text-gc-fg-muted rounded-lg border border-dashed py-2.5 transition ${
            dragging
              ? "border-gc-accent bg-gc-accent/5 text-gc-fg"
              : "border-gc-line hover:border-gc-fg-muted hover:bg-gc-bg-3/40"
          }`}
        >
          <ImagePlus size={14} />
          <span>Trascina o clicca per aggiungere immagini ({items.length}/{MAX_FILES})</span>
        </button>
      ) : null}
    </div>
  );
}

function ItemTile({
  item,
  onRemove,
}: {
  item: UploadItem;
  onRemove: (id: string) => void;
}) {
  const localPreview = useObjectUrl(item.file);
  const showThumb = item.thumbUrl ?? localPreview;
  return (
    <div className="relative aspect-square rounded-md overflow-hidden bg-gc-bg-3 border border-gc-line">
      {showThumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={showThumb}
          alt=""
          className="w-full h-full object-cover"
        />
      ) : null}

      {/* Overlay status */}
      {item.status === "uploading" ? (
        <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center gap-1 text-white">
          <Loader2 size={16} className="animate-spin" />
          <span className="text-[10px] font-medium">{item.progress}%</span>
        </div>
      ) : null}
      {item.status === "processing" ? (
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center text-white">
          <Loader2 size={16} className="animate-spin" />
        </div>
      ) : null}
      {item.status === "error" ? (
        <div className="absolute inset-0 bg-gc-danger/80 flex items-center justify-center p-1">
          <span className="text-[10px] text-white text-center leading-tight">
            {item.error}
          </span>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => onRemove(item.localId)}
        aria-label="Rimuovi"
        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"
      >
        <X size={12} />
      </button>
    </div>
  );
}

function useObjectUrl(file: File): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return url;
}
