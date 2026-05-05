"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Info, Trash2, X } from "lucide-react";

export type ConfirmModalVariant = "danger" | "warning" | "info";

export interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmModalVariant;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const variantMap: Record<
  ConfirmModalVariant,
  { icon: React.ReactNode; confirmBg: string; confirmHover: string }
> = {
  danger: {
    icon: <Trash2 size={18} />,
    confirmBg: "#dc2626",
    confirmHover: "#b91c1c",
  },
  warning: {
    icon: <AlertTriangle size={18} />,
    confirmBg: "#d97706",
    confirmHover: "#b45309",
  },
  info: {
    icon: <Info size={18} />,
    confirmBg: "var(--admin-accent)",
    confirmHover: "var(--admin-accent-hover, #0c4e54)",
  },
};

/**
 * ConfirmModal — modale di conferma riutilizzabile per tutta l'amministrazione.
 *
 * Uso:
 *   const [modal, setModal] = useState<ConfirmModalProps | null>(null);
 *
 *   // aprire:
 *   setModal({
 *     open: true,
 *     title: "Elimina pagina",
 *     message: "Sei sicuro? L'operazione è irreversibile.",
 *     variant: "danger",
 *     confirmLabel: "Elimina",
 *     onConfirm: () => { doDelete(); setModal(null); },
 *     onCancel: () => setModal(null),
 *   });
 *
 *   // nel JSX:
 *   {modal && <ConfirmModal {...modal} />}
 */
export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  variant = "danger",
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const t = useTranslations("admin.confirmModal");
  const cancelRef = useRef<HTMLButtonElement>(null);
  const { icon, confirmBg, confirmHover } = variantMap[variant];
  const resolvedConfirm = confirmLabel ?? t("defaultConfirm");
  const resolvedCancel = cancelLabel ?? t("defaultCancel");

  // Focus trap: focus sul bottone annulla all'apertura
  useEffect(() => {
    if (open) {
      setTimeout(() => cancelRef.current?.focus(), 30);
    }
  }, [open]);

  // Chiudi con Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        onClick={onCancel}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 10000,
          background: "rgba(0,0,0,0.45)",
          backdropFilter: "blur(2px)",
          animation: "cm-fade-in 140ms ease",
        }}
      />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cm-title"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 10001,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1rem",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            background: "var(--admin-card-bg, #1c1b19)",
            border: "1px solid var(--admin-card-border, #2a2927)",
            borderRadius: "14px",
            boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
            width: "100%",
            maxWidth: "420px",
            pointerEvents: "auto",
            animation: "cm-slide-up 160ms cubic-bezier(0.16,1,0.3,1)",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "18px 20px 14px",
              borderBottom: "1px solid var(--admin-card-border, #2a2927)",
            }}
          >
            <span
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 34,
                height: 34,
                borderRadius: "8px",
                background:
                  variant === "danger"
                    ? "rgba(220,38,38,0.12)"
                    : variant === "warning"
                      ? "rgba(217,119,6,0.12)"
                      : "color-mix(in srgb, var(--admin-accent) 12%, transparent)",
                color:
                  variant === "danger"
                    ? "#ef4444"
                    : variant === "warning"
                      ? "#f59e0b"
                      : "var(--admin-accent)",
                flexShrink: 0,
              }}
            >
              {icon}
            </span>
            <h2
              id="cm-title"
              style={{
                flex: 1,
                fontSize: "15px",
                fontWeight: 600,
                color: "var(--admin-text, #cdccca)",
                margin: 0,
              }}
            >
              {title}
            </h2>
            <button
              onClick={onCancel}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 28,
                height: 28,
                borderRadius: "6px",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: "var(--admin-text-faint, #5a5957)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--admin-hover-bg, rgba(255,255,255,0.06))";
                e.currentTarget.style.color = "var(--admin-text-muted, #797876)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "var(--admin-text-faint, #5a5957)";
              }}
              aria-label={t("closeAria")}
            >
              <X size={15} />
            </button>
          </div>

          {/* Body */}
          <div
            style={{
              padding: "16px 20px 20px",
              fontSize: "14px",
              lineHeight: 1.6,
              color: "var(--admin-text-muted, #797876)",
            }}
          >
            {message}
          </div>

          {/* Footer */}
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "8px",
              padding: "0 20px 18px",
            }}
          >
            <button
              ref={cancelRef}
              onClick={onCancel}
              disabled={loading}
              style={{
                padding: "7px 16px",
                fontSize: "13px",
                fontWeight: 500,
                borderRadius: "8px",
                border: "1px solid var(--admin-card-border, #2a2927)",
                background: "transparent",
                color: "var(--admin-text-muted, #797876)",
                cursor: "pointer",
                transition: "border-color 140ms ease, color 140ms ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--admin-input-border, #3a3937)";
                e.currentTarget.style.color = "var(--admin-text, #cdccca)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--admin-card-border, #2a2927)";
                e.currentTarget.style.color = "var(--admin-text-muted, #797876)";
              }}
            >
              {resolvedCancel}
            </button>

            <button
              onClick={onConfirm}
              disabled={loading}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "7px 16px",
                fontSize: "13px",
                fontWeight: 600,
                borderRadius: "8px",
                border: "none",
                background: loading ? "#6b7280" : confirmBg,
                color: "#fff",
                cursor: loading ? "not-allowed" : "pointer",
                transition: "filter 140ms ease",
              }}
              onMouseEnter={(e) => {
                if (!loading) e.currentTarget.style.filter = "brightness(0.88)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.filter = "none";
              }}
            >
              {loading && (
                <span
                  style={{
                    display: "inline-block",
                    width: 13,
                    height: 13,
                    border: "2px solid rgba(255,255,255,0.35)",
                    borderTopColor: "#fff",
                    borderRadius: "50%",
                    animation: "cm-spin 0.6s linear infinite",
                  }}
                />
              )}
              {resolvedConfirm}
            </button>
          </div>
        </div>
      </div>

      {/* Keyframes iniettati una volta sola */}
      <style>{`
        @keyframes cm-fade-in  { from { opacity: 0 } to { opacity: 1 } }
        @keyframes cm-slide-up { from { opacity: 0; transform: translateY(10px) scale(0.97) } to { opacity: 1; transform: translateY(0) scale(1) } }
        @keyframes cm-spin     { to { transform: rotate(360deg) } }
      `}</style>
    </>,
    document.body,
  );
}
