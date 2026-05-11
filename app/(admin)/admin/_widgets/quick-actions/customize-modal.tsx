"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { LayoutGrid, RotateCcw, X } from "lucide-react";

import { getNavIcon } from "@/lib/admin/nav/icon-map";
import {
  resetUserQuickActions,
  saveUserQuickActions,
} from "@/app/(admin)/admin/actions";
import type { QuickActionOptionView } from "./customize-trigger";

const MAX = 10;

export interface CustomizeModalProps {
  open: boolean;
  onClose: () => void;
  available: ReadonlyArray<QuickActionOptionView>;
  initialSelected: ReadonlyArray<string>;
  hasUserOverride: boolean;
}

export default function CustomizeModal({
  open,
  onClose,
  available,
  initialSelected,
  hasUserOverride,
}: CustomizeModalProps) {
  const t = useTranslations("admin.dashboard.widgets.quickActions.customize");
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(initialSelected),
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Re-sync when the modal reopens after a save/reset cycle.
  useEffect(() => {
    if (open) {
      setSelected(new Set(initialSelected));
      setError(null);
    }
  }, [open, initialSelected]);

  // Initial focus on Cancel — gives keyboard users a non-destructive
  // landing spot and works for screen readers via the dialog label.
  useEffect(() => {
    if (open) setTimeout(() => cancelRef.current?.focus(), 30);
  }, [open]);

  // Escape closes when not in a pending save (avoid losing the user's
  // selection mid-roundtrip).
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !pending) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, pending]);

  // Group options by groupKey, preserving the order in `available` so
  // the modal mirrors the sidebar layout the user already knows.
  const grouped = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, { label: string; items: QuickActionOptionView[] }>();
    for (const opt of available) {
      if (!map.has(opt.groupKey)) {
        map.set(opt.groupKey, { label: opt.groupLabel, items: [] });
        order.push(opt.groupKey);
      }
      map.get(opt.groupKey)!.items.push(opt);
    }
    return order.map((k) => ({ groupKey: k, ...map.get(k)! }));
  }, [available]);

  const count = selected.size;
  const atCap = count >= MAX;

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        if (next.size >= MAX) return prev; // hard cap
        next.add(key);
      }
      return next;
    });
  }

  function handleSave() {
    setError(null);
    // Persist in the order the options were rendered in (registry
    // order) — selection order is unstable, registry order matches the
    // sidebar so the widget grid reads predictably.
    const ordered = available
      .filter((o) => selected.has(o.key))
      .map((o) => o.key);
    startTransition(async () => {
      const res = await saveUserQuickActions(ordered);
      if ("error" in res) {
        setError(t("errorSaving"));
        return;
      }
      router.refresh();
      onClose();
    });
  }

  function handleReset() {
    setError(null);
    startTransition(async () => {
      const res = await resetUserQuickActions();
      if ("error" in res) {
        setError(t("errorResetting"));
        return;
      }
      router.refresh();
      onClose();
    });
  }

  if (!open) return null;

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
          animation: "qac-fade-in 140ms ease",
        }}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="qac-title"
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
            borderRadius: 14,
            boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
            width: "100%",
            maxWidth: 520,
            maxHeight: "min(80vh, 720px)",
            display: "flex",
            flexDirection: "column",
            pointerEvents: "auto",
            animation: "qac-slide-up 160ms cubic-bezier(0.16,1,0.3,1)",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
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
                borderRadius: 8,
                background:
                  "color-mix(in srgb, var(--admin-accent) 12%, transparent)",
                color: "var(--admin-accent)",
                flexShrink: 0,
              }}
            >
              <LayoutGrid size={17} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2
                id="qac-title"
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  color: "var(--admin-text)",
                  margin: 0,
                }}
              >
                {t("title")}
              </h2>
              <p
                style={{
                  margin: "2px 0 0 0",
                  fontSize: 12,
                  color: "var(--admin-text-faint)",
                }}
              >
                {t("subtitle", { count, max: MAX })}
              </p>
            </div>
            <button
              onClick={onClose}
              disabled={pending}
              aria-label={t("closeAria")}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 28,
                height: 28,
                borderRadius: 6,
                background: "transparent",
                border: "none",
                cursor: pending ? "not-allowed" : "pointer",
                color: "var(--admin-text-faint)",
              }}
            >
              <X size={15} />
            </button>
          </div>

          {/* Body */}
          <div
            style={{
              padding: "8px 20px 16px",
              overflowY: "auto",
              flex: 1,
            }}
          >
            {grouped.length === 0 ? (
              <p
                style={{
                  fontSize: 13,
                  color: "var(--admin-text-faint)",
                  textAlign: "center",
                  padding: "30px 10px",
                }}
              >
                {t("empty")}
              </p>
            ) : (
              grouped.map((g) => (
                <section key={g.groupKey} style={{ marginTop: 12 }}>
                  <h3
                    style={{
                      margin: "0 0 6px 0",
                      fontSize: 10,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      color: "var(--admin-text-faint)",
                    }}
                  >
                    {g.label}
                  </h3>
                  <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                    {g.items.map((it) => (
                      <OptionRow
                        key={it.key}
                        option={it}
                        checked={selected.has(it.key)}
                        disabled={!selected.has(it.key) && atCap}
                        onToggle={() => toggle(it.key)}
                      />
                    ))}
                  </ul>
                </section>
              ))
            )}

            {error && (
              <p
                style={{
                  marginTop: 12,
                  fontSize: 12,
                  color: "#ef4444",
                  background: "rgba(239,68,68,0.08)",
                  padding: "8px 10px",
                  borderRadius: 6,
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
              gap: 8,
              padding: "12px 20px 16px",
              borderTop: "1px solid var(--admin-card-border, #2a2927)",
            }}
          >
            <div>
              {hasUserOverride && (
                <button
                  onClick={handleReset}
                  disabled={pending}
                  title={t("resetTooltip")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "7px 12px",
                    fontSize: 12,
                    fontWeight: 500,
                    borderRadius: 8,
                    border: "1px solid var(--admin-card-border, #2a2927)",
                    background: "transparent",
                    color: "var(--admin-text-muted)",
                    cursor: pending ? "not-allowed" : "pointer",
                  }}
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
                  fontSize: 13,
                  fontWeight: 500,
                  borderRadius: 8,
                  border: "1px solid var(--admin-card-border, #2a2927)",
                  background: "transparent",
                  color: "var(--admin-text-muted)",
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
                  gap: 6,
                  padding: "7px 16px",
                  fontSize: 13,
                  fontWeight: 600,
                  borderRadius: 8,
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
                      animation: "qac-spin 0.6s linear infinite",
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
        @keyframes qac-fade-in  { from { opacity: 0 } to { opacity: 1 } }
        @keyframes qac-slide-up { from { opacity: 0; transform: translateY(10px) scale(0.97) } to { opacity: 1; transform: translateY(0) scale(1) } }
        @keyframes qac-spin     { to { transform: rotate(360deg) } }
      `}</style>
    </>,
    document.body,
  );
}

// ── Row ─────────────────────────────────────────────────────────────────────

function OptionRow({
  option,
  checked,
  disabled,
  onToggle,
}: {
  option: QuickActionOptionView;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const Icon = getNavIcon(option.icon);

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        role="switch"
        aria-checked={checked}
        aria-label={option.label}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 6px",
          background: "transparent",
          border: "none",
          borderBottom: "1px solid var(--admin-divider)",
          cursor: disabled ? "not-allowed" : "pointer",
          color: disabled ? "var(--admin-text-faint)" : "var(--admin-text)",
          fontSize: 13,
          textAlign: "left",
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <Icon
          size={14}
          style={{
            color: checked
              ? "var(--admin-accent)"
              : "var(--admin-text-muted)",
            flexShrink: 0,
          }}
        />
        <span style={{ flex: 1, minWidth: 0 }}>{option.label}</span>
        <span
          aria-hidden
          style={{
            position: "relative",
            width: 36,
            height: 20,
            borderRadius: 999,
            background: checked
              ? "var(--admin-accent)"
              : "var(--admin-input-border)",
            transition: "background 140ms",
            flexShrink: 0,
          }}
        >
          <span
            style={{
              position: "absolute",
              top: 2,
              left: checked ? 18 : 2,
              width: 16,
              height: 16,
              borderRadius: 999,
              background: "#fff",
              transition: "left 140ms",
              boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
            }}
          />
        </span>
      </button>
    </li>
  );
}
