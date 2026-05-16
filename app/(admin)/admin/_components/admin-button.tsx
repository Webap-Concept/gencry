"use client";
// app/(admin)/admin/_components/admin-button.tsx
//
// Primitive `<AdminButton>` per tutti i bottoni del pannello admin.
//
// REGOLA: in /admin/** usare SEMPRE <AdminButton> al posto di <button>
// nudo (vedi memory feedback_admin_button_primitive). Hover feedback
// automatico per ogni variant — niente più drift dove alcuni bottoni
// hanno hover e altri no.
//
// API speculare a Button shadcn ma con tokens --admin-*:
//   variant: 'primary' | 'secondary' | 'ghost' | 'destructive' | 'icon'
//   size:    'sm' | 'md' | 'lg' | 'icon'
//   icon:    LucideIcon opzionale (renderizzato a sinistra del label)
//   loading: spinner sostituisce l'icona; disabilita il click
//
// AdminDialogCancelButton/ConfirmButton restano come thin wrapper di
// AdminButton (vedi admin-dialog.tsx).

import * as React from "react";
import { Loader2, type LucideIcon } from "lucide-react";

export type AdminButtonVariant =
  | "primary" // Arancio admin-accent
  | "secondary" // Outline neutra (annulla, secondary CTA)
  | "ghost" // Trasparente con hover (toolbar, table row actions)
  | "destructive" // Rosso (elimina, ban)
  | "icon"; // Solo icona quadrata (toolbar dense)

export type AdminButtonSize = "sm" | "md" | "lg" | "icon";

type AdminButtonOwnProps = {
  variant?: AdminButtonVariant;
  size?: AdminButtonSize;
  icon?: LucideIcon;
  loading?: boolean;
};

export type AdminButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  AdminButtonOwnProps;

// Padding/font in base alla size. icon è quadrato.
const SIZE_STYLES: Record<AdminButtonSize, React.CSSProperties> = {
  sm: { padding: "4px 12px", fontSize: 12, height: 28, gap: 6 },
  md: { padding: "6px 14px", fontSize: 13, height: 34, gap: 8 },
  lg: { padding: "8px 18px", fontSize: 14, height: 40, gap: 8 },
  icon: { width: 32, height: 32, padding: 0, gap: 0 },
};

// Stile base + hover per ogni variant. Hover è gestito via state JS
// (onMouseEnter/Leave) per evitare di dover dichiarare le hover come
// classi Tailwind o pseudo CSS in scope inline-style (i tokens admin
// vivono come var(--admin-*), non come classi).
function variantStyles(variant: AdminButtonVariant, hovered: boolean) {
  switch (variant) {
    case "primary":
      return {
        background: hovered
          ? "color-mix(in srgb, var(--admin-accent) 88%, black)"
          : "var(--admin-accent)",
        color: "#fff",
        border: "1px solid transparent",
      };
    case "secondary":
      return {
        background: hovered
          ? "var(--admin-hover-bg)"
          : "var(--admin-card-bg)",
        color: "var(--admin-text)",
        border: "1px solid var(--admin-card-border)",
      };
    case "ghost":
      return {
        background: hovered ? "var(--admin-hover-bg)" : "transparent",
        color: "var(--admin-text)",
        border: "1px solid transparent",
      };
    case "destructive":
      return {
        background: hovered
          ? "color-mix(in srgb, var(--gc-neg, #dc2626) 85%, black)"
          : "var(--gc-neg, #dc2626)",
        color: "#fff",
        border: "1px solid transparent",
      };
    case "icon":
      return {
        background: hovered ? "var(--admin-hover-bg)" : "transparent",
        color: "var(--admin-text-muted)",
        border: "1px solid transparent",
      };
  }
}

export const AdminButton = React.forwardRef<HTMLButtonElement, AdminButtonProps>(
  function AdminButton(
    {
      variant = "primary",
      size = "md",
      icon: Icon,
      loading = false,
      disabled,
      type = "button",
      style,
      onMouseEnter,
      onMouseLeave,
      children,
      ...rest
    },
    ref,
  ) {
    const [hovered, setHovered] = React.useState(false);
    const isDisabled = disabled || loading;
    const sizeStyle = SIZE_STYLES[size];
    const palette = variantStyles(variant, hovered && !isDisabled);

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        onMouseEnter={(e) => {
          setHovered(true);
          onMouseEnter?.(e);
        }}
        onMouseLeave={(e) => {
          setHovered(false);
          onMouseLeave?.(e);
        }}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 8,
          fontWeight: 500,
          cursor: isDisabled ? "not-allowed" : "pointer",
          opacity: isDisabled ? 0.5 : 1,
          transition: "background-color 120ms ease, border-color 120ms ease",
          whiteSpace: "nowrap",
          ...sizeStyle,
          ...palette,
          ...style,
        }}
        {...rest}>
        {loading ? (
          <Loader2 size={size === "lg" ? 16 : 13} className="animate-spin" aria-hidden />
        ) : Icon ? (
          <Icon size={size === "lg" ? 16 : size === "sm" ? 12 : 14} strokeWidth={1.75} aria-hidden />
        ) : null}
        {size === "icon" ? null : children}
      </button>
    );
  },
);
