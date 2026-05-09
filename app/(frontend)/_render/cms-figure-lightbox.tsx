"use client";

import { buildOptimizedImageUrl } from "@/lib/storage/image-optimizer";
import { IMAGE_PRESETS } from "@/lib/storage/image-widths";
import { useEffect, useState } from "react";

/**
 * Click-to-zoom lightbox per le immagini `<figure data-zoom="true">`
 * inserite via Tiptap `figureImage` node nel content CMS.
 *
 * Implementazione:
 *  - Al mount, scanniamo il DOM cercando `figure.cms-figure[data-zoom="true"]
 *    img` e attacchiamo un click handler.
 *  - Al click, apriamo un overlay full-screen con l'immagine in dimensioni
 *    naturali (max-w/max-h vincolate al viewport) + caption sotto se
 *    presente nel <figcaption> sibling.
 *  - Chiusura: ESC, click sul backdrop, o tasto X.
 *
 * Niente dipendenze (no `yet-another-react-lightbox` o simili) — l'overlay
 * è ~50 righe JSX, evita di trascinare un pacchetto di lightbox solo per
 * questo. Niente carousel: una immagine alla volta.
 *
 * Mounting: come sibling di <CmsPage> dentro `_render/cms-page.tsx` —
 * scansiona TUTTO il document, quindi una sola istanza per pagina basta.
 */
export function CmsFigureLightbox() {
  const [active, setActive] = useState<{
    src: string;
    alt: string;
    caption: string | null;
  } | null>(null);

  useEffect(() => {
    const figures = document.querySelectorAll<HTMLElement>(
      'figure.cms-figure[data-zoom="true"]',
    );
    if (figures.length === 0) return;

    const handlers: Array<{ el: HTMLImageElement; fn: (e: MouseEvent) => void }> =
      [];

    for (const fig of Array.from(figures)) {
      const img = fig.querySelector("img");
      if (!img) continue;
      const fig0 = fig; // capture
      const handler = (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const cap = fig0.querySelector("figcaption");
        // Preferiamo `data-src-full` (URL canonico Supabase, settato dal
        // sanitize server-side) e generiamo una variante ottimizzata
        // alla risoluzione del lightbox preset. Se manca il data-attr
        // (URL esterni paste-ati nel rich-text), fallback al `src`.
        const fullSrc = img.getAttribute("data-src-full");
        const renderSrc = fullSrc
          ? buildOptimizedImageUrl(
              fullSrc,
              IMAGE_PRESETS.cmsLightbox.default,
              IMAGE_PRESETS.cmsLightbox.quality,
            )
          : img.getAttribute("src") ?? "";
        setActive({
          src: renderSrc,
          alt: img.getAttribute("alt") ?? "",
          caption: cap?.textContent?.trim() || null,
        });
      };
      img.addEventListener("click", handler);
      handlers.push({ el: img, fn: handler });
    }

    return () => {
      for (const h of handlers) {
        h.el.removeEventListener("click", h.fn);
      }
    };
  }, []);

  // ESC chiude
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActive(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [active]);

  // Body scroll lock quando aperto
  useEffect(() => {
    if (!active) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [active]);

  if (!active) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={() => setActive(null)}
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center p-4 sm:p-8 bg-black/85 backdrop-blur-sm"
      style={{ animation: "cms-lightbox-fade 150ms ease-out" }}>
      <button
        type="button"
        aria-label="Chiudi"
        onClick={(e) => {
          e.stopPropagation();
          setActive(null);
        }}
        className="absolute top-4 right-4 w-10 h-10 rounded-full flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 transition-colors text-2xl">
        ×
      </button>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={active.src}
        alt={active.alt}
        onClick={(e) => e.stopPropagation()}
        className="max-w-full max-h-[85vh] object-contain rounded shadow-2xl cursor-default"
      />

      {active.caption && (
        <p
          onClick={(e) => e.stopPropagation()}
          className="mt-4 max-w-2xl text-center text-sm italic text-white/85 px-4">
          {active.caption}
        </p>
      )}

      <style>{`
        @keyframes cms-lightbox-fade {
          from { opacity: 0 }
          to { opacity: 1 }
        }
      `}</style>
    </div>
  );
}
