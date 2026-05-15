"use client";
// app/(admin)/admin/_components/admin-dialog.tsx
//
// Convenience wrapper sopra le primitive shadcn `<Dialog>` per le modali
// del pannello admin. Non re-implementa nulla: compone `Dialog` /
// `DialogContent` / `DialogHeader` / `DialogTitle` / `DialogDescription` /
// `DialogClose` di components/ui/dialog.tsx esponendo un'API a slot
// (`icon`, `title`, `description`, `footer`, `size`) coerente con lo
// stile della staff modal — la nostra "ground truth" visuale.
//
// I token CSS `--gc-modal-bg` / `--gc-modal-border` / etc. usati dalla
// shadcn primitive sono mappati ai token admin in `admin.css` (scope
// admin) → niente più sfondo trasparente in admin.
//
// REGOLA: in /admin/** usare sempre `<AdminDialog>` (vedi
// feedback_admin_dialog_primitive). Per modali frontend resta lo
// shadcn `<Dialog>` raw.
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Loader2, X, type LucideIcon } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────
// Re-exports — Dialog open-state primitives
// ─────────────────────────────────────────────────────────────────────────

export const AdminDialog = Dialog;
export const AdminDialogTrigger = DialogTrigger;
export const AdminDialogClose = DialogClose;

// ─────────────────────────────────────────────────────────────────────────
// Content — header (icon + title/description stacked + close) / body / footer
// ─────────────────────────────────────────────────────────────────────────

export type AdminDialogSize = "sm" | "md" | "lg" | "xl";

const SIZE_MAX_WIDTH: Record<AdminDialogSize, string> = {
  sm: "!max-w-sm",
  md: "!max-w-md",
  lg: "!max-w-lg",
  xl: "!max-w-2xl",
};

export type AdminDialogContentProps = {
  /** Icona Lucide mostrata in un cerchietto accent a sinistra del titolo. */
  icon?: LucideIcon;
  title: string;
  /** Sottotitolo opzionale, stacked sotto al title. */
  description?: React.ReactNode;
  /** Larghezza max. Default `lg` (32rem). */
  size?: AdminDialogSize;
  /** Footer slot (di solito AdminDialogCancelButton +
   *  AdminDialogConfirmButton). Se omesso, niente footer. */
  footer?: React.ReactNode;
  /** Nascondi il bottone close X in alto a destra (default false). */
  hideCloseButton?: boolean;
  closeAriaLabel?: string;
  className?: string;
  children?: React.ReactNode;
};

export function AdminDialogContent({
  icon: Icon,
  title,
  description,
  size = "lg",
  footer,
  hideCloseButton = false,
  closeAriaLabel = "Chiudi",
  className,
  children,
}: AdminDialogContentProps) {
  return (
    <DialogContent
      // Disabilitiamo il close X built-in (siede in absolute top-right,
      // collide col nostro header layout). Lo rendiamo noi dentro
      // DialogHeader, allineato verticalmente al titolo.
      showCloseButton={false}
      className={cn(SIZE_MAX_WIDTH[size], className)}>
      {/* Header — shadcn DialogHeader è `flex items-center gap-3 px-5 py-4`.
          La staff modal lo riusa così, ma con un wrapper interno flex-col
          per stackare titolo + description sotto l'icona. */}
      <DialogHeader>
        {Icon ? (
          <span
            className="flex items-center justify-center w-9 h-9 rounded-lg shrink-0"
            style={{
              background:
                "color-mix(in srgb, var(--admin-accent) 12%, transparent)",
              color: "var(--admin-accent)",
            }}>
            <Icon size={18} />
          </span>
        ) : null}
        <div className="flex-1 min-w-0">
          <DialogTitle className="!text-[15px] !font-semibold !text-[color:var(--admin-text)] leading-snug">
            {title}
          </DialogTitle>
          {description ? (
            <DialogDescription className="!text-xs !text-[color:var(--admin-text-faint)] mt-1 leading-snug">
              {description}
            </DialogDescription>
          ) : null}
        </div>
        {!hideCloseButton ? (
          <DialogClose
            aria-label={closeAriaLabel}
            className="flex items-center justify-center w-7 h-7 rounded-md shrink-0 transition-colors"
            style={{ color: "var(--admin-text-faint)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--admin-hover-bg)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}>
            <X size={15} />
          </DialogClose>
        ) : null}
      </DialogHeader>

      {/* Body — padding standard ricalcato dalle altre form admin. */}
      <div className="px-5 py-4">{children}</div>

      {/* Footer — opzionale, right-aligned. */}
      {footer ? (
        <div
          className="flex items-center justify-end gap-2 px-5 py-3"
          style={{ borderTop: "1px solid var(--admin-card-border)" }}>
          {footer}
        </div>
      ) : null}
    </DialogContent>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Body field helpers
// ─────────────────────────────────────────────────────────────────────────

/** Stile input/textarea/select coerente con il resto delle form admin. */
export const adminFieldStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  fontSize: 13,
  borderRadius: 8,
  background: "var(--admin-page-bg)",
  border: "1px solid var(--admin-input-border)",
  color: "var(--admin-text)",
  outline: "none",
  boxSizing: "border-box",
};

export function AdminDialogField({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span
        className="block text-[11px] uppercase tracking-wider font-medium mb-1.5"
        style={{ color: "var(--admin-text-faint)" }}>
        {label}
      </span>
      {children}
      {error ? (
        <p
          className="text-[11px] mt-1"
          style={{ color: "var(--gc-neg, #dc2626)" }}>
          {error}
        </p>
      ) : hint ? (
        <p
          className="text-[11px] mt-1"
          style={{ color: "var(--admin-text-faint)" }}>
          {hint}
        </p>
      ) : null}
    </label>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Buttons — standardizzati per i footer
// ─────────────────────────────────────────────────────────────────────────

export function AdminDialogCancelButton({
  onClick,
  disabled = false,
  children = "Annulla",
}: {
  onClick?: () => void;
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="px-3 py-1.5 rounded-lg text-sm transition-colors disabled:opacity-50"
      style={{
        background: "var(--admin-hover-bg)",
        color: "var(--admin-text)",
        border: "1px solid var(--admin-card-border)",
      }}>
      {children}
    </button>
  );
}

export function AdminDialogConfirmButton({
  onClick,
  disabled = false,
  loading = false,
  variant = "primary",
  icon: Icon,
  type = "button",
  children,
}: {
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: "primary" | "danger";
  icon?: LucideIcon;
  type?: "button" | "submit";
  children: React.ReactNode;
}) {
  const bg =
    variant === "danger" ? "var(--gc-neg, #dc2626)" : "var(--admin-accent)";
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className="px-4 py-1.5 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
      style={{ background: bg }}>
      {loading ? (
        <Loader2 size={13} className="animate-spin" />
      ) : Icon ? (
        <Icon size={13} />
      ) : null}
      {children}
    </button>
  );
}
