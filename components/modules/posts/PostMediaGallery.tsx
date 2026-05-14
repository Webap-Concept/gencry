"use client";
// components/modules/posts/PostMediaGallery.tsx
//
// Gallery responsive per i media di un post + lightbox fullscreen.
// Layout:
//   1 img  → full width, aspect ratio nativo (caps max-h 480px)
//   2 imgs → 2 colonne 1:1
//   3 imgs → grid 2-col: prima alta su 2 righe, altre 2 stacked
//   4 imgs → grid 2x2 1:1
//
// Click su img → Dialog shadcn fullscreen con `fullUrl`. La griglia usa
// `thumbUrl` (400px) per risparmiare banda e dare paint istantaneo.
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PostMediaPublic } from "@/lib/modules/posts/types";

export function PostMediaGallery({ media }: { media: PostMediaPublic[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (media.length === 0) return null;

  const items = media.slice(0, 4); // safety cap

  return (
    <>
      <div className={layoutFor(items.length)}>
        {items.map((m, i) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setOpenIndex(i)}
            className={`relative overflow-hidden bg-gc-bg-3 ${tileClass(items.length, i)}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={m.thumbUrl}
              alt=""
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover transition-transform duration-200 hover:scale-[1.02]"
            />
          </button>
        ))}
      </div>

      <Dialog
        open={openIndex !== null}
        onOpenChange={(o) => !o && setOpenIndex(null)}
      >
        <DialogContent
          showCloseButton
          className="w-[calc(100vw-2rem)] sm:max-w-[90vw] max-h-[90vh] p-0 bg-black border-black overflow-hidden"
        >
          <DialogTitle className="sr-only">Anteprima immagine</DialogTitle>
          {openIndex !== null ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={items[openIndex].fullUrl}
              alt=""
              referrerPolicy="no-referrer"
              className="w-full h-auto max-h-[90vh] object-contain"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function layoutFor(n: number): string {
  const base = "mt-3 rounded-gc-sm overflow-hidden border border-gc-line/60 grid gap-0.5 bg-gc-line/60";
  if (n === 1) return `${base} grid-cols-1`;
  if (n === 2) return `${base} grid-cols-2`;
  if (n === 3) return `${base} grid-cols-2 grid-rows-2`;
  return `${base} grid-cols-2 grid-rows-2`;
}

function tileClass(n: number, i: number): string {
  if (n === 1) return "aspect-[16/10] max-h-[480px]";
  if (n === 2) return "aspect-square";
  if (n === 3) {
    if (i === 0) return "row-span-2 aspect-[1/2]";
    return "aspect-square";
  }
  // n === 4
  return "aspect-square";
}
