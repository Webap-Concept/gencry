"use client";
// app/(admin)/admin/_components/admin-dialog.tsx
//
// Modale canonica per il pannello admin. Wrappa Radix Dialog (stesse
// primitive di components/ui/dialog.tsx) ma con skin admin: token
// --admin-card-bg/-border, header con icon-in-circle + titolo +
// description STACKED, close X built-in, footer right-aligned con
// bottoni "Annulla outlined / Conferma accent" standard.
//
// REGOLA: tutte le modali in /admin/** devono usare `AdminDialog` —
// MAI <Dialog> shadcn raw (lo skin frontend `gc-modal-*` non è
// disponibile in admin scope), MAI portali hand-rolled. Per le modali
// pubbliche (frontend) resta lo standard shadcn Dialog.
//
// Esempio:
//   <AdminDialog open={open} onOpenChange={setOpen}>
//     <AdminDialogContent
//       icon={UserPlus}
//       title="Aggiungi membro Staff"
//       description="Promuovi un utente o invitalo via email."
//       footer={
//         <>
//           <AdminDialogCancelButton onClick={() => setOpen(false)} />
//           <AdminDialogConfirmButton onClick={submit}>
//             Aggiungi
//           </AdminDialogConfirmButton>
//         </>
//       }>
//       {/* body content qui */}
//     </AdminDialogContent>
//   </AdminDialog>
import { Dialog as DialogPrimitive } from "radix-ui";
import { Loader2, X, type LucideIcon } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────
// Re-exports — Radix primitives che servono direttamente
// ─────────────────────────────────────────────────────────────────────────

export const AdminDialog = DialogPrimitive.Root;
export const AdminDialogTrigger = DialogPrimitive.Trigger;
export const AdminDialogClose = DialogPrimitive.Close;

// ─────────────────────────────────────────────────────────────────────────
// Overlay (dark scrim)
// ─────────────────────────────────────────────────────────────────────────

function AdminDialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="admin-dialog-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/45 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        className,
      )}
      style={{ backdropFilter: "blur(2px)" }}
      {...props}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Content — header (icon+title+description+X) / body / footer
// ─────────────────────────────────────────────────────────────────────────

export type AdminDialogSize = "sm" | "md" | "lg" | "xl";

const SIZE_MAX_WIDTH: Record<AdminDialogSize, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-2xl",
};

export type AdminDialogContentProps = {
  /** Icona Lucide mostrata in un cerchietto accent a sinistra del titolo. */
  icon?: LucideIcon;
  title: string;
  /** Sottotitolo opzionale, sotto al title. */
  description?: React.ReactNode;
  /** Larghezza max. Default `lg` (32rem). */
  size?: AdminDialogSize;
  /** Footer slot (di solito un AdminDialogCancelButton +
   *  AdminDialogConfirmButton). Se omesso, niente footer. */
  footer?: React.ReactNode;
  /** Nascondi il bottone close X in alto a destra (default false). */
  hideCloseButton?: boolean;
  /** Tradurre l'aria-label del close. */
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
    <DialogPrimitive.Portal>
      <AdminDialogOverlay />
      <DialogPrimitive.Content
        data-slot="admin-dialog-content"
        className={cn(
          "fixed left-[50%] top-[50%] z-50 w-full translate-x-[-50%] translate-y-[-50%] rounded-2xl shadow-xl",
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 duration-200",
          SIZE_MAX_WIDTH[size],
          className,
        )}
        style={{
          background: "var(--admin-card-bg)",
          border: "1px solid var(--admin-card-border)",
          color: "var(--admin-text)",
        }}>
        {/* Header — icon (optional) + title + description stacked + close X */}
        <div
          className="flex items-start gap-3 px-5 py-4"
          style={{ borderBottom: "1px solid var(--admin-card-border)" }}>
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
            <DialogPrimitive.Title
              data-slot="admin-dialog-title"
              className="text-[15px] font-semibold leading-snug"
              style={{ color: "var(--admin-text)" }}>
              {title}
            </DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description
                data-slot="admin-dialog-description"
                className="text-xs mt-1 leading-snug"
                style={{ color: "var(--admin-text-faint)" }}>
                {description}
              </DialogPrimitive.Description>
            ) : null}
          </div>
          {!hideCloseButton ? (
            <DialogPrimitive.Close
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
            </DialogPrimitive.Close>
          ) : null}
        </div>

        {/* Body — il caller scriva direttamente i field. Il padding è già
            qui, niente bisogno di wrapper aggiuntivi nel call site. */}
        <div className="px-5 py-4">{children}</div>

        {/* Footer — opzionale, right-aligned */}
        {footer ? (
          <div
            className="flex items-center justify-end gap-2 px-5 py-3"
            style={{ borderTop: "1px solid var(--admin-card-border)" }}>
            {footer}
          </div>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Body field helpers — coerenti con notifications-form / staff-modal
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
    variant === "danger"
      ? "var(--gc-neg, #dc2626)"
      : "var(--admin-accent)";
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
