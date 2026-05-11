"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Info, LayoutDashboard, RotateCcw, X } from "lucide-react";
import type {
  WidgetMeta,
  WidgetSetupGuide as WidgetSetupGuideData,
} from "@/lib/admin/dashboard/types";
import WidgetSetupGuide from "./widget-setup-guide";
import {
  resetUserDashboardWidgets,
  saveUserDashboardWidgets,
} from "../actions";

export interface DashboardConfigModalProps {
  open: boolean;
  onClose: () => void;
  /** Widgets the current user is allowed to see (registry pre-filtered by RBAC). */
  visibleWidgets: ReadonlyArray<WidgetMeta>;
  /** Resolved enabled ids — what the user sees on the page right now. */
  initialEnabled: ReadonlyArray<string>;
  /** Whether the user has an explicit row in admin_user_preferences.
   *  Drives the "Reset to role default" affordance. */
  hasUserOverride: boolean;
}

export default function DashboardConfigModal({
  open,
  onClose,
  visibleWidgets,
  initialEnabled,
  hasUserOverride,
}: DashboardConfigModalProps) {
  const t = useTranslations("admin.dashboard.configModal");
  const router = useRouter();
  const [enabled, setEnabled] = useState<Set<string>>(() => new Set(initialEnabled));
  const [openGuides, setOpenGuides] = useState<Set<string>>(() => new Set());
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Resync local state when the modal is reopened after a save/reset cycle.
  useEffect(() => {
    if (open) {
      setEnabled(new Set(initialEnabled));
      setOpenGuides(new Set());
      setError(null);
    }
  }, [open, initialEnabled]);

  useEffect(() => {
    if (open) setTimeout(() => cancelRef.current?.focus(), 30);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !pending) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, pending]);

  if (!open) return null;

  function toggle(id: string) {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleGuide(id: string) {
    setOpenGuides((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const res = await saveUserDashboardWidgets([...enabled]);
      if ("error" in res) {
        setError(t("errorSaving"));
        return;
      }
      // The server action invalidates the cache, but Next won't re-run
      // the page RSC on its own when the URL hasn't changed — without
      // this refresh the user keeps seeing the pre-save dashboard until
      // they hit reload.
      router.refresh();
      onClose();
    });
  }

  function handleReset() {
    setError(null);
    startTransition(async () => {
      const res = await resetUserDashboardWidgets();
      if ("error" in res) {
        setError(t("errorResetting"));
        return;
      }
      router.refresh();
      onClose();
    });
  }

  return createPortal(
    <>
      <div
        onClick={pending ? undefined : onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 10000,
          background: "rgba(0,0,0,0.45)",
          backdropFilter: "blur(2px)",
          animation: "dcm-fade-in 140ms ease",
        }}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dcm-title"
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
            maxWidth: "520px",
            maxHeight: "min(80vh, 720px)",
            display: "flex",
            flexDirection: "column",
            pointerEvents: "auto",
            animation: "dcm-slide-up 160ms cubic-bezier(0.16,1,0.3,1)",
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
                  "color-mix(in srgb, var(--admin-accent) 12%, transparent)",
                color: "var(--admin-accent)",
                flexShrink: 0,
              }}
            >
              <LayoutDashboard size={17} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2
                id="dcm-title"
                style={{
                  fontSize: "15px",
                  fontWeight: 600,
                  color: "var(--admin-text, #cdccca)",
                  margin: 0,
                }}
              >
                {t("title")}
              </h2>
              <p
                style={{
                  margin: "2px 0 0 0",
                  fontSize: "12px",
                  color: "var(--admin-text-faint, #5a5957)",
                }}
              >
                {t("subtitle")}
              </p>
            </div>
            <button
              onClick={onClose}
              disabled={pending}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 28,
                height: 28,
                borderRadius: "6px",
                background: "transparent",
                border: "none",
                cursor: pending ? "not-allowed" : "pointer",
                color: "var(--admin-text-faint, #5a5957)",
              }}
              aria-label={t("closeAria")}
            >
              <X size={15} />
            </button>
          </div>

          {/* Body */}
          <div
            style={{
              padding: "10px 20px 16px",
              overflowY: "auto",
              flex: 1,
            }}
          >
            {visibleWidgets.length === 0 ? (
              <p
                style={{
                  fontSize: "13px",
                  color: "var(--admin-text-faint, #5a5957)",
                  textAlign: "center",
                  padding: "30px 10px",
                }}
              >
                {t("emptyAvailable")}
              </p>
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {visibleWidgets.map((w) => (
                  <WidgetRow
                    key={w.id}
                    widget={w}
                    checked={enabled.has(w.id)}
                    onToggle={() => toggle(w.id)}
                    guideOpen={openGuides.has(w.id)}
                    onToggleGuide={() => toggleGuide(w.id)}
                  />
                ))}
              </ul>
            )}

            {error && (
              <p
                style={{
                  marginTop: 10,
                  fontSize: "12px",
                  color: "#ef4444",
                  background: "rgba(239,68,68,0.08)",
                  padding: "8px 10px",
                  borderRadius: "6px",
                }}
              >
                {error}
              </p>
            )}
          </div>

          {/* Footer */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "8px",
              padding: "12px 20px 16px",
              borderTop: "1px solid var(--admin-card-border, #2a2927)",
            }}
          >
            <div>
              {hasUserOverride && (
                <button
                  onClick={handleReset}
                  disabled={pending}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "7px 12px",
                    fontSize: "12px",
                    fontWeight: 500,
                    borderRadius: "8px",
                    border: "1px solid var(--admin-card-border, #2a2927)",
                    background: "transparent",
                    color: "var(--admin-text-muted, #797876)",
                    cursor: pending ? "not-allowed" : "pointer",
                  }}
                  title={t("resetTooltip")}
                >
                  <RotateCcw size={12} />
                  {t("resetButton")}
                </button>
              )}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                ref={cancelRef}
                onClick={onClose}
                disabled={pending}
                style={{
                  padding: "7px 16px",
                  fontSize: "13px",
                  fontWeight: 500,
                  borderRadius: "8px",
                  border: "1px solid var(--admin-card-border, #2a2927)",
                  background: "transparent",
                  color: "var(--admin-text-muted, #797876)",
                  cursor: pending ? "not-allowed" : "pointer",
                }}
              >
                {t("cancelButton")}
              </button>
              <button
                onClick={handleSave}
                disabled={pending}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "7px 16px",
                  fontSize: "13px",
                  fontWeight: 600,
                  borderRadius: "8px",
                  border: "none",
                  background: pending ? "#6b7280" : "var(--admin-accent)",
                  color: "#fff",
                  cursor: pending ? "not-allowed" : "pointer",
                }}
              >
                {pending && (
                  <span
                    style={{
                      display: "inline-block",
                      width: 12,
                      height: 12,
                      border: "2px solid rgba(255,255,255,0.35)",
                      borderTopColor: "#fff",
                      borderRadius: "50%",
                      animation: "dcm-spin 0.6s linear infinite",
                    }}
                  />
                )}
                {t("saveButton")}
              </button>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes dcm-fade-in  { from { opacity: 0 } to { opacity: 1 } }
        @keyframes dcm-slide-up { from { opacity: 0; transform: translateY(10px) scale(0.97) } to { opacity: 1; transform: translateY(0) scale(1) } }
        @keyframes dcm-spin     { to { transform: rotate(360deg) } }
      `}</style>
    </>,
    document.body,
  );
}

function WidgetRow({
  widget,
  checked,
  onToggle,
  guideOpen,
  onToggleGuide,
}: {
  widget: WidgetMeta;
  checked: boolean;
  onToggle: () => void;
  guideOpen: boolean;
  onToggleGuide: () => void;
}) {
  const t = useTranslations("admin.dashboard");
  const title = t(widget.titleKey);
  const description = widget.descriptionKey ? t(widget.descriptionKey) : "";
  const guide = widget.setupGuideKey
    ? (t.raw(widget.setupGuideKey) as WidgetSetupGuideData | undefined)
    : undefined;

  return (
    <li
      style={{
        padding: "12px 4px",
        borderBottom: "1px solid var(--admin-card-border, #2a2927)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 14,
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <p
              style={{
                margin: 0,
                fontSize: "13px",
                fontWeight: 500,
                color: "var(--admin-text, #cdccca)",
              }}
            >
              {title}
            </p>
            {guide && (
              <button
                type="button"
                onClick={onToggleGuide}
                aria-label={t("configModal.guideToggleAria", { name: title })}
                aria-expanded={guideOpen}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 18,
                  height: 18,
                  border: "none",
                  background: guideOpen
                    ? "color-mix(in srgb, var(--admin-accent) 14%, transparent)"
                    : "transparent",
                  color: guideOpen
                    ? "var(--admin-accent)"
                    : "var(--admin-text-faint, #5a5957)",
                  borderRadius: 4,
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                <Info size={12} />
              </button>
            )}
          </div>
          {description && (
            <p
              style={{
                margin: "2px 0 0 0",
                fontSize: "11px",
                color: "var(--admin-text-faint, #5a5957)",
                lineHeight: 1.5,
              }}
            >
              {description}
            </p>
          )}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label={title}
          onClick={onToggle}
          style={{
            position: "relative",
            width: 38,
            height: 22,
            borderRadius: 999,
            border: "none",
            background: checked
              ? "var(--admin-accent)"
              : "var(--admin-input-border, #3a3937)",
            cursor: "pointer",
            flexShrink: 0,
            transition: "background-color 140ms ease",
          }}
        >
          <span
            style={{
              position: "absolute",
              top: 2,
              left: 2,
              width: 18,
              height: 18,
              borderRadius: "50%",
              background: "#fff",
              transform: checked ? "translateX(16px)" : "translateX(0)",
              transition: "transform 140ms ease",
              boxShadow: "0 1px 3px rgba(0,0,0,0.35)",
            }}
          />
        </button>
      </div>
      {guide && guideOpen && (
        <div
          style={{
            marginTop: 10,
            padding: "10px 12px",
            background: "var(--admin-page-bg)",
            border: "1px solid var(--admin-card-border)",
            borderRadius: 8,
          }}
        >
          <WidgetSetupGuide guide={guide} />
        </div>
      )}
    </li>
  );
}
