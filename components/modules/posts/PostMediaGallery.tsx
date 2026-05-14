"use client";
// components/modules/posts/PostMediaGallery.tsx
//
// Gallery dei media. Due varianti:
//
//   variant="feed" (default) — strategia "max 2 visibili + slide":
//     - 1 img  → full-width, aspect 16/10, max-h 480px
//     - 2+ img → carousel CSS-snap, ogni tile 50% width aspect-square,
//                scrollbar nascosta (.no-scrollbar), dots cliccabili
//                + frecce ChevronLeft/Right sui lati su md+.
//
//   variant="single" — pagina /post/[id]:
//     - tutte le foto in stack verticale, ognuna full-width aspect
//       16/10 max-h 480px. No carousel, no dots, no frecce — l'utente
//       è "dentro al post" e vuole vedere tutto a colpo d'occhio.
//
// Click su tile → lightbox con keyboard ←/→, swipe, frecce, counter.
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PostMediaPublic } from "@/lib/modules/posts/types";

const MAX_VISIBLE = 4;

export type PostMediaGalleryVariant = "feed" | "single";

export function PostMediaGallery({
  media,
  variant = "feed",
}: {
  media: PostMediaPublic[];
  variant?: PostMediaGalleryVariant;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  if (media.length === 0) return null;
  const items = media.slice(0, MAX_VISIBLE);

  return (
    <>
      {variant === "single" ? (
        <StackVertical items={items} onPick={setOpenIndex} />
      ) : items.length === 1 ? (
        <SinglePhoto item={items[0]} onClick={() => setOpenIndex(0)} />
      ) : (
        <Carousel items={items} onPick={setOpenIndex} />
      )}

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
// Variant "single": stack verticale, tutte visibili
// ─────────────────────────────────────────────────────────────────────────

function StackVertical({
  items,
  onPick,
}: {
  items: PostMediaPublic[];
  onPick: (i: number) => void;
}) {
  return (
    <div className="mt-3 flex flex-col gap-2">
      {items.map((m, i) => (
        <button
          key={m.id}
          type="button"
          onClick={() => onPick(i)}
          className="relative w-full overflow-hidden rounded-gc-sm border border-gc-line/60 bg-gc-bg-3 aspect-[16/10] max-h-[480px]"
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
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Variant "feed", 1 foto: full-width singolo
// ─────────────────────────────────────────────────────────────────────────

function SinglePhoto({
  item,
  onClick,
}: {
  item: PostMediaPublic;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-3 relative w-full overflow-hidden rounded-gc-sm border border-gc-line/60 bg-gc-bg-3 aspect-[16/10] max-h-[480px]"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={item.thumbUrl}
        alt=""
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        className="w-full h-full object-cover transition-transform duration-200 hover:scale-[1.02]"
      />
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Variant "feed", 2+ foto: carousel
// ─────────────────────────────────────────────────────────────────────────

function Carousel({
  items,
  onPick,
}: {
  items: PostMediaPublic[];
  onPick: (i: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tileRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const showDots = items.length > 2;
  const showArrows = items.length > 2;

  // IntersectionObserver per il dot attivo (la tile più visibile).
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new IntersectionObserver(
      (entries) => {
        let best: { index: number; ratio: number } | null = null;
        for (const entry of entries) {
          const idx = tileRefs.current.findIndex((el) => el === entry.target);
          if (idx === -1) continue;
          if (entry.isIntersecting && entry.intersectionRatio > 0) {
            if (!best || entry.intersectionRatio > best.ratio) {
              best = { index: idx, ratio: entry.intersectionRatio };
            }
          }
        }
        if (best) setActiveIndex(best.index);
      },
      { root: container, threshold: [0.3, 0.6, 0.9] },
    );
    for (const el of tileRefs.current) if (el) observer.observe(el);
    return () => observer.disconnect();
  }, [items.length]);

  const scrollToIndex = useCallback((idx: number) => {
    const tile = tileRefs.current[idx];
    if (!tile) return;
    tile.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
  }, []);

  const scrollByOne = useCallback((dir: 1 | -1) => {
    const container = containerRef.current;
    if (!container) return;
    const firstTile = tileRefs.current[0];
    if (!firstTile) return;
    const tileWidth = firstTile.getBoundingClientRect().width;
    container.scrollBy({ left: dir * tileWidth, behavior: "smooth" });
  }, []);

  return (
    <div className="mt-3 relative">
      <div
        ref={containerRef}
        className="no-scrollbar flex gap-1 overflow-x-auto snap-x snap-mandatory rounded-gc-sm border border-gc-line/60 bg-gc-line/40"
      >
        {items.map((m, i) => (
          <button
            key={m.id}
            type="button"
            ref={(el) => {
              tileRefs.current[i] = el;
            }}
            onClick={() => onPick(i)}
            className="snap-start shrink-0 basis-[calc(50%-2px)] aspect-square overflow-hidden bg-gc-bg-3"
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

      {showArrows ? (
        <>
          <button
            type="button"
            onClick={() => scrollByOne(-1)}
            aria-label="Scorri a sinistra"
            className="hidden md:flex absolute left-1.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 text-white items-center justify-center"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            onClick={() => scrollByOne(1)}
            aria-label="Scorri a destra"
            className="hidden md:flex absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 text-white items-center justify-center"
          >
            <ChevronRight size={18} />
          </button>
        </>
      ) : null}

      {showDots ? (
        <div className="flex justify-center gap-1.5 mt-2">
          {items.map((m, i) => (
            <button
              key={m.id}
              type="button"
              onClick={() => scrollToIndex(i)}
              aria-label={`Vai all'immagine ${i + 1}`}
              aria-current={i === activeIndex ? "true" : undefined}
              className={`h-1.5 rounded-full transition-all hover:bg-gc-fg-muted ${
                i === activeIndex ? "w-4 bg-gc-accent" : "w-1.5 bg-gc-line"
              }`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Lightbox: frecce + ←/→ + swipe + counter (loop wrap-around)
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
