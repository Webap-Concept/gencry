"use client";
// components/ui/gc-modal.tsx
//
// Wrapper "high-level" sopra le primitive shadcn `<Dialog>` per le modali
// dell'esperienza pubblica/loggata (frontend). Non re-implementa nulla:
// compone `Dialog` / `DialogContent` / `DialogHeader` / `DialogTitle` /
// `DialogDescription` / `DialogClose` di components/ui/dialog.tsx esponendo
// un'API a slot (`icon`, `title`, `description`, `footer`, `size`, `iconTone`)
// coerente con il pattern della reconsent modal — la nostra ground truth.
//
// REGOLA: in tutte le modali frontend nuove o esistenti usare `<GcModal>`
// (vedi memory feedback_gc_modal_primitive). Eccezioni ammesse e già
// documentate inline nei file:
//   - Lightbox/fullscreen overlay (es. PostMediaGallery)
//   - Modali "bare" con chrome custom integrato (es. PostComposerModal)
//
// Per il twin admin vedi app/(admin)/admin/_components/admin-dialog.tsx.
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { X, type LucideIcon } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────
// Re-exports — Dialog open-state primitives
// ─────────────────────────────────────────────────────────────────────────

export const GcModal = Dialog;
export const GcModalTrigger = DialogTrigger;
export const GcModalClose = DialogClose;

// ─────────────────────────────────────────────────────────────────────────
// Content — header (icon + title/description stacked + close) / body / footer
// ─────────────────────────────────────────────────────────────────────────

export type GcModalSize = "sm" | "md" | "lg" | "xl";

const SIZE_MAX_WIDTH: Record<GcModalSize, string> = {
  sm: "!max-w-sm",
  md: "!max-w-md",
  lg: "!max-w-lg",
  xl: "!max-w-2xl",
};

export type GcModalIconTone = "default" | "warning" | "danger" | "info";

const ICON_TONE_STYLE: Record<GcModalIconTone, React.CSSProperties> = {
  default: {
    background: "color-mix(in srgb, var(--gc-accent) 14%, transparent)",
    color: "var(--gc-accent)",
  },
  warning: {
    background: "var(--gc-warning-bg)",
    color: "var(--gc-warning-fg)",
  },
  danger: {
    background: "color-mix(in srgb, var(--gc-neg) 14%, transparent)",
    color: "var(--gc-neg)",
  },
  info: {
    background: "var(--gc-bg-3)",
    color: "var(--gc-fg-2)",
  },
};

export type GcModalContentProps = {
  /** Icona Lucide mostrata in un quadrato a sinistra del titolo. */
  icon?: LucideIcon;
  /** Tono cromatico del badge icona. Default `default` (accent brand). */
  iconTone?: GcModalIconTone;
  /** Titolo principale. Stacked sopra description. */
  title: React.ReactNode;
  /** Sottotitolo opzionale, stacked sotto il title (stesso pattern di AdminDialog). */
  description?: React.ReactNode;
  /** Larghezza max. Default `md`. */
  size?: GcModalSize;
  /** Footer slot (di solito 1-3 `<Button>` di components/ui/button.tsx). */
  footer?: React.ReactNode;
  /** Nascondi il close X in alto a destra (default false). Usato per modali bloccanti. */
  hideCloseButton?: boolean;
  closeAriaLabel?: string;
  /** Disabilita il close ESC/click-outside. Usato per modali bloccanti. */
  preventDismiss?: boolean;
  /** Override max-height del body (default 85vh). */
  className?: string;
  /** Body slot. Riceve già padding standard px-5 py-4. */
  children?: React.ReactNode;
};

export function GcModalContent({
  icon: Icon,
  iconTone = "default",
  title,
  description,
  size = "md",
  footer,
  hideCloseButton = false,
  closeAriaLabel = "Chiudi",
  preventDismiss = false,
  className,
  children,
}: GcModalContentProps) {
  return (
    <DialogContent
      // Disabilitiamo il close built-in (siede in absolute top-right e
      // collide col nostro layout header). Lo rendiamo noi dentro
      // DialogHeader allineato verticalmente al titolo.
      showCloseButton={false}
      onEscapeKeyDown={(e) => {
        if (preventDismiss) e.preventDefault();
      }}
      onInteractOutside={(e) => {
        if (preventDismiss) e.preventDefault();
      }}
      className={cn(
        SIZE_MAX_WIDTH[size],
        "p-0 max-h-[85vh] flex flex-col",
        className,
      )}>
      {/* Header — flex orizzontale: icona (opt) · stack title/description · close (opt).
          Sfrutta il padding/border-bottom built-in di DialogHeader. */}
      <DialogHeader>
        {Icon ? (
          <span
            className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0"
            style={ICON_TONE_STYLE[iconTone]}
            aria-hidden>
            <Icon size={16} />
          </span>
        ) : null}
        <div className="flex-1 min-w-0">
          <DialogTitle className="!text-base !font-semibold !text-gc-fg leading-snug">
            {title}
          </DialogTitle>
          {description ? (
            <DialogDescription className="!text-xs !text-gc-fg-3 mt-1 leading-snug">
              {description}
            </DialogDescription>
          ) : null}
        </div>
        {!hideCloseButton ? (
          <DialogClose
            aria-label={closeAriaLabel}
            className="flex items-center justify-center w-7 h-7 rounded-md shrink-0 text-gc-fg-3 hover:bg-gc-bg-3 hover:text-gc-fg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gc-line">
            <X size={15} />
          </DialogClose>
        ) : null}
      </DialogHeader>

      {/* Body — scroll interno, padding standard. */}
      <div className="flex-1 overflow-auto px-5 py-4">{children}</div>

      {/* Footer — opzionale, slot libero (di solito <Button> shadcn). */}
      {footer ? (
        <div className="flex flex-wrap items-center justify-end gap-2 px-5 py-3 border-t border-gc-modal-border">
          {footer}
        </div>
      ) : null}
    </DialogContent>
  );
}
