"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  ZoomIn,
} from "lucide-react";

/**
 * Tiptap custom node `figureImage` — sostituisce l'extension Image default.
 *
 * HTML output:
 *   <figure class="cms-figure"
 *           data-align="center|left|right|full"
 *           data-zoom="true|false"
 *           style="width: NN%">
 *     <img src="..." alt="..." />
 *     <figcaption>...</figcaption>   (omesso se vuoto)
 *   </figure>
 *
 * Frontend lo renderizza pari pari via dangerouslySetInnerHTML; lo styling
 * (float/center/full + responsive) è in `(frontend)/frontend.css`. Lo zoom
 * è gestito dal lightbox client component (`cms-figure-lightbox.tsx`)
 * che scanna `[data-zoom="true"]` nel content renderato.
 *
 * In editor il rendering passa per il NodeView React qui sotto: floating
 * toolbar che appare quando l'immagine è selezionata, caption editabile
 * inline, controlli per width/align/zoom.
 */

export type FigureAlign = "left" | "center" | "right" | "full";

interface FigureImageAttrs {
  src: string;
  alt: string | null;
  caption: string;
  width: number; // 25, 50, 75, 100
  align: FigureAlign;
  zoom: boolean;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    figureImage: {
      setFigureImage: (opts: {
        src: string;
        alt?: string;
        caption?: string;
        width?: number;
        align?: FigureAlign;
        zoom?: boolean;
      }) => ReturnType;
    };
  }
}

export const FigureImage = Node.create<{
  HTMLAttributes: Record<string, unknown>;
}>({
  name: "figureImage",
  group: "block",
  atom: true, // node atomico: il content (img + caption) è gestito dal NodeView
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      src: { default: "" },
      alt: { default: null },
      caption: { default: "" },
      width: { default: 100, parseHTML: (el) => parseWidth(el) },
      align: { default: "center", parseHTML: (el) => parseAlign(el) },
      zoom: { default: false, parseHTML: (el) => parseZoom(el) },
    };
  },

  parseHTML() {
    return [
      {
        tag: "figure.cms-figure",
        getAttrs: (el) => {
          if (!(el instanceof HTMLElement)) return false;
          const img = el.querySelector("img");
          if (!img) return false;
          const figcaption = el.querySelector("figcaption");
          return {
            src: img.getAttribute("src") ?? "",
            alt: img.getAttribute("alt") ?? null,
            caption: figcaption?.textContent ?? "",
            width: parseWidth(el),
            align: parseAlign(el),
            zoom: parseZoom(el),
          };
        },
      },
    ];
  },

  renderHTML({ node }) {
    const attrs = node.attrs as FigureImageAttrs;
    const figureAttrs = mergeAttributes(this.options.HTMLAttributes ?? {}, {
      class: "cms-figure",
      "data-align": attrs.align,
      "data-zoom": attrs.zoom ? "true" : "false",
      style: `width: ${attrs.width}%`,
    });
    const children: Array<[string, Record<string, unknown>] | [string, Record<string, unknown>, string]> = [
      [
        "img",
        {
          src: attrs.src,
          alt: attrs.alt ?? "",
        },
      ],
    ];
    if (attrs.caption.trim() !== "") {
      children.push(["figcaption", {}, attrs.caption]);
    }
    return ["figure", figureAttrs, ...children] as never;
  },

  addCommands() {
    return {
      setFigureImage:
        (opts) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: {
              src: opts.src,
              alt: opts.alt ?? null,
              caption: opts.caption ?? "",
              width: opts.width ?? 100,
              align: opts.align ?? "center",
              zoom: opts.zoom ?? false,
            },
          });
        },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(FigureImageView);
  },
});

// ---------------------------------------------------------------------------
// NodeView React — l'esperienza in editor
// ---------------------------------------------------------------------------

const WIDTH_PRESETS = [25, 50, 75, 100] as const;

function FigureImageView(props: NodeViewProps) {
  const { node, updateAttributes, selected } = props;
  const attrs = node.attrs as FigureImageAttrs;

  // WYSIWYG vero: il NodeViewWrapper è un <figure> reale con `data-align`
  // e `width: N%` inline — gli stessi attributi che genera renderHTML().
  // Le regole `.tiptap-editor figure.cms-figure[data-align="left|right"]
  // { float ... }` in page-editor.tsx replicano il comportamento del
  // frontend, così se l'admin allinea a sinistra il testo successivo gli
  // si avvolge a destra anche dentro l'editor — niente più mismatch.
  return (
    <NodeViewWrapper
      as="figure"
      className="cms-figure"
      data-align={attrs.align}
      style={{
        width: `${attrs.width}%`,
        position: "relative",
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={attrs.src}
          alt={attrs.alt ?? ""}
          style={{
            display: "block",
            width: "100%",
            height: "auto",
            borderRadius: "0.5rem",
            outline: selected ? "2px solid var(--admin-accent)" : "none",
            outlineOffset: "2px",
          }}
        />
        {attrs.zoom && (
          <span
            className="absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium pointer-events-none"
            style={{
              background: "rgba(0,0,0,0.7)",
              color: "white",
            }}>
            <ZoomIn className="w-3 h-3" /> zoom
          </span>
        )}

        <input
          type="text"
          value={attrs.caption}
          onChange={(e) => updateAttributes({ caption: e.target.value })}
          placeholder="Caption (vuoto = nessuna)"
          className="block w-full mt-2 px-2 py-1 text-xs italic text-center bg-transparent border-0 outline-none"
          style={{
            color: "var(--admin-text-muted)",
            borderTop: attrs.caption ? "1px solid var(--admin-divider)" : "none",
          }}
        />
      {selected && (
        <FloatingToolbar
          attrs={attrs}
          onUpdate={(patch) => updateAttributes(patch)}
        />
      )}
    </NodeViewWrapper>
  );
}

function FloatingToolbar({
  attrs,
  onUpdate,
}: {
  attrs: FigureImageAttrs;
  onUpdate: (patch: Partial<FigureImageAttrs>) => void;
}) {
  return (
    <div
      contentEditable={false}
      className="absolute -top-9 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-lg px-2 py-1 shadow-md"
      style={{
        background: "var(--admin-card-bg)",
        border: "1px solid var(--admin-card-border)",
        zIndex: 5,
      }}>
      {/* Width preset chips */}
      <div className="flex items-center gap-0.5 mr-1">
        {WIDTH_PRESETS.map((w) => (
          <button
            key={w}
            type="button"
            onClick={() => onUpdate({ width: w })}
            className="px-1.5 py-0.5 text-[11px] font-medium rounded transition-colors"
            style={{
              color:
                attrs.width === w
                  ? "var(--admin-accent)"
                  : "var(--admin-text-muted)",
              background:
                attrs.width === w
                  ? "color-mix(in srgb, var(--admin-accent) 12%, var(--admin-card-bg))"
                  : "transparent",
            }}>
            {w}%
          </button>
        ))}
      </div>

      <div
        className="w-px h-4"
        style={{ background: "var(--admin-divider)" }}
      />

      {/* Align icons */}
      <div className="flex items-center gap-0.5 mx-1">
        <AlignButton
          active={attrs.align === "left"}
          onClick={() => onUpdate({ align: "left" })}
          title="Sinistra (testo a destra)">
          <AlignLeft className="w-3.5 h-3.5" />
        </AlignButton>
        <AlignButton
          active={attrs.align === "center"}
          onClick={() => onUpdate({ align: "center" })}
          title="Centrato">
          <AlignCenter className="w-3.5 h-3.5" />
        </AlignButton>
        <AlignButton
          active={attrs.align === "right"}
          onClick={() => onUpdate({ align: "right" })}
          title="Destra (testo a sinistra)">
          <AlignRight className="w-3.5 h-3.5" />
        </AlignButton>
        <AlignButton
          active={attrs.align === "full"}
          onClick={() => onUpdate({ align: "full" })}
          title="Larghezza piena (no wrap)">
          <AlignJustify className="w-3.5 h-3.5" />
        </AlignButton>
      </div>

      <div
        className="w-px h-4"
        style={{ background: "var(--admin-divider)" }}
      />

      {/* Zoom toggle */}
      <button
        type="button"
        onClick={() => onUpdate({ zoom: !attrs.zoom })}
        className="flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded transition-colors ml-1"
        style={{
          color: attrs.zoom
            ? "var(--admin-accent)"
            : "var(--admin-text-muted)",
          background: attrs.zoom
            ? "color-mix(in srgb, var(--admin-accent) 12%, var(--admin-card-bg))"
            : "transparent",
        }}
        title="Click-to-zoom sul frontend">
        <ZoomIn className="w-3.5 h-3.5" />
        Zoom
      </button>
    </div>
  );
}

function AlignButton({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="p-1 rounded transition-colors"
      style={{
        color: active ? "var(--admin-accent)" : "var(--admin-text-muted)",
        background: active
          ? "color-mix(in srgb, var(--admin-accent) 12%, var(--admin-card-bg))"
          : "transparent",
      }}>
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Helpers parseHTML
// ---------------------------------------------------------------------------

function parseWidth(el: HTMLElement): number {
  const style = el.getAttribute("style") ?? "";
  const m = style.match(/width:\s*(\d+(?:\.\d+)?)\s*%/i);
  if (!m) return 100;
  const n = Number.parseFloat(m[1]);
  if (!Number.isFinite(n) || n <= 0 || n > 100) return 100;
  // Snap al preset più vicino: tollerante a valori fuori griglia in DB legacy
  return WIDTH_PRESETS.reduce((best, p) =>
    Math.abs(p - n) < Math.abs(best - n) ? p : best,
  );
}

function parseAlign(el: HTMLElement): FigureAlign {
  const v = el.getAttribute("data-align");
  if (v === "left" || v === "right" || v === "center" || v === "full") return v;
  return "center";
}

function parseZoom(el: HTMLElement): boolean {
  return el.getAttribute("data-zoom") === "true";
}
