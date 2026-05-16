"use client";

import { AlertCircle, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * AdminSectionInfo — small "!" button next to a section title that opens
 * a guide modal explaining how the feature works, what to monitor, and
 * mitigations to apply if it ever misbehaves.
 *
 * Designed as the standard pattern for every admin section: drop one of
 * these next to the page title, pass the guide content as children.
 *
 * Usage:
 *   <h2>Sessions</h2>
 *   <AdminSectionInfo title="About this section">
 *     <SessionsAdminGuide />
 *   </AdminSectionInfo>
 */
export function AdminSectionInfo({
  title = "Section info",
  children,
  ariaLabel,
  size = "sm",
}: {
  /** Modal header. */
  title?: string;
  /** The guide content. */
  children: React.ReactNode;
  /** Accessible label for the trigger button. Defaults to title. */
  ariaLabel?: string;
  /** Trigger button size. `sm` = 24px (default, for inline next to a
   *  small title). `md` = 32px (for sticky header tab-bar, visually
   *  punchier and easier hit target). */
  size?: "sm" | "md";
}) {
  const [open, setOpen] = useState(false);
  const triggerSize = size === "md" ? 32 : 24;
  const iconSize = size === "md" ? 16 : 13;

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Lock background scroll while modal is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={ariaLabel ?? title}
        className="inline-flex items-center justify-center rounded-full transition-colors"
        style={{
          width: triggerSize,
          height: triggerSize,
          background: "transparent",
          color: "var(--admin-text-faint, #5a5957)",
          border: "1px solid var(--admin-card-border, #2a2927)",
          cursor: "pointer",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = "var(--admin-accent)";
          e.currentTarget.style.borderColor = "var(--admin-accent)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = "var(--admin-text-faint, #5a5957)";
          e.currentTarget.style.borderColor =
            "var(--admin-card-border, #2a2927)";
        }}>
        <AlertCircle size={iconSize} strokeWidth={2.2} />
      </button>

      {open && <SectionInfoModal title={title} onClose={() => setOpen(false)}>{children}</SectionInfoModal>}
    </>
  );
}

// ---------------------------------------------------------------------------
// Modal — portal-mounted, scrollable body
// ---------------------------------------------------------------------------

function SectionInfoModal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  // Mount only once on the client (portal needs document.body).
  if (typeof document === "undefined") return null;

  return createPortal(
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 10000,
          background: "rgba(0,0,0,0.45)",
          backdropFilter: "blur(2px)",
          animation: "asi-fade-in 140ms ease",
        }}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="asi-title"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 10001,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1rem",
          pointerEvents: "none",
        }}>
        <div
          style={{
            background: "var(--admin-card-bg, #1c1b19)",
            border: "1px solid var(--admin-card-border, #2a2927)",
            borderRadius: 14,
            boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
            width: "100%",
            maxWidth: 640,
            maxHeight: "85vh",
            display: "flex",
            flexDirection: "column",
            pointerEvents: "auto",
            animation: "asi-slide-up 160ms cubic-bezier(0.16,1,0.3,1)",
          }}>
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "16px 20px",
              borderBottom: "1px solid var(--admin-card-border, #2a2927)",
              flexShrink: 0,
            }}>
            <span
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 30,
                height: 30,
                borderRadius: 8,
                background:
                  "color-mix(in srgb, var(--admin-accent) 14%, transparent)",
                color: "var(--admin-accent)",
                flexShrink: 0,
              }}>
              <AlertCircle size={16} />
            </span>
            <h2
              id="asi-title"
              style={{
                flex: 1,
                fontSize: 15,
                fontWeight: 600,
                color: "var(--admin-text, #cdccca)",
                margin: 0,
              }}>
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 28,
                height: 28,
                borderRadius: 6,
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: "var(--admin-text-faint, #5a5957)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background =
                  "var(--admin-hover-bg, rgba(255,255,255,0.06))";
                e.currentTarget.style.color =
                  "var(--admin-text-muted, #797876)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color =
                  "var(--admin-text-faint, #5a5957)";
              }}>
              <X size={15} />
            </button>
          </div>

          {/* Scrollable body */}
          <div
            style={{
              padding: "18px 22px 22px",
              overflowY: "auto",
              fontSize: 13.5,
              lineHeight: 1.6,
              color: "var(--admin-text-muted, #797876)",
            }}>
            {children}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes asi-fade-in  { from { opacity: 0 } to { opacity: 1 } }
        @keyframes asi-slide-up { from { opacity: 0; transform: translateY(10px) scale(0.97) } to { opacity: 1; transform: translateY(0) scale(1) } }
      `}</style>
    </>,
    document.body,
  );
}
