"use client";
// components/modules/posts/PostMediaGallery.tsx
//
// Gallery responsive per i media di un post + lightbox fullscreen
// con navigation (frecce on-screen + keyboard ←/→ + swipe mobile).
//
// Layout grid:
//   1 img  → full width, aspect 16/10 (caps max-h 480px)
//   2 imgs → 2 colonne 1:1
//   3 imgs → 2 cols, prima alta su 2 righe + 2 stacked
//   4 imgs → 2x2 1:1
//
// Click → Dialog shadcn fullscreen con fullUrl. Loop wrap-around
// (dal 4 al 1, dal 1 al 4) — pattern Instagram/X.
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
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

      <Lightbox
        items={items}
        openIndex={openIndex}
        onClose={() => setOpenIndex(null)}
        onChange={setOpenIndex}
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Lightbox con navigation
// ─────────────────────────────────────────────────────────────────────────

const SWIPE_THRESHOLD = 50;

function Lightbox({
  items,
  openIndex,
  onClose,
  onChange,
}: {
  items: PostMediaPublic[];
  openIndex: number | null;
  onClose: () => void;
  onChange: (i: number) => void;
}) {
  const total = items.length;
  const hasNav = total > 1;
  const touchStartX = useRef<number | null>(null);

  const prev = useCallback(() => {
    if (openIndex === null) return;
    onChange((openIndex - 1 + total) % total);
  }, [openIndex, total, onChange]);
  const next = useCallback(() => {
    if (openIndex === null) return;
    onChange((openIndex + 1) % total);
  }, [openIndex, total, onChange]);

  // Keyboard navigation (←/→). ESC è gestito dal Dialog di shadcn.
  useEffect(() => {
    if (openIndex === null || !hasNav) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        prev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openIndex, hasNav, prev, next]);

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const endX = e.changedTouches[0]?.clientX ?? touchStartX.current;
    const delta = endX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) < SWIPE_THRESHOLD) return;
    if (delta < 0) next();
    else prev();
  };

  return (
    <Dialog open={openIndex !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        showCloseButton
        className="w-[calc(100vw-2rem)] sm:max-w-[90vw] max-h-[90vh] p-0 bg-black border-black overflow-hidden"
      >
        <DialogTitle className="sr-only">Anteprima immagine</DialogTitle>
        {openIndex !== null ? (
          <div
            className="relative w-full h-full flex items-center justify-center"
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={items[openIndex].fullUrl}
              alt=""
              referrerPolicy="no-referrer"
              className="w-full h-auto max-h-[90vh] object-contain select-none"
              draggable={false}
            />

            {hasNav ? (
              <>
                <button
                  type="button"
                  onClick={prev}
                  aria-label="Immagine precedente"
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 hover:bg-black/70 text-white flex items-center justify-center transition"
                >
                  <ChevronLeft size={22} />
                </button>
                <button
                  type="button"
                  onClick={next}
                  aria-label="Immagine successiva"
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 hover:bg-black/70 text-white flex items-center justify-center transition"
                >
                  <ChevronRight size={22} />
                </button>

                {/* Counter "n / total" in alto. Lascio offset orizzontale
                    per non collidere con la X close-button. */}
                <span className="absolute top-3 left-1/2 -translate-x-1/2 text-xs text-white/80 bg-black/40 px-2 py-1 rounded-full pointer-events-none">
                  {openIndex + 1} / {total}
                </span>
              </>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Layout helpers
// ─────────────────────────────────────────────────────────────────────────

function layoutFor(n: number): string {
  const base =
    "mt-3 rounded-gc-sm overflow-hidden border border-gc-line/60 grid gap-0.5 bg-gc-line/60";
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
