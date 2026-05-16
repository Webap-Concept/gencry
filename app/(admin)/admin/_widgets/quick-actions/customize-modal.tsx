"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { LayoutGrid, RotateCcw } from "lucide-react";

import {
  AdminDialog,
  AdminDialogCancelButton,
  AdminDialogConfirmButton,
  AdminDialogContent,
} from "@/app/(admin)/admin/_components/admin-dialog";
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

  // Re-sync when the modal reopens after a save/reset cycle.
  useEffect(() => {
    if (open) {
      setSelected(new Set(initialSelected));
      setError(null);
    }
  }, [open, initialSelected]);

  // Focus + ESC handling delegati a Radix tramite AdminDialog (focus trap,
  // body-scroll-lock, ESC). Niente più listener manuali.

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

  return (
    <AdminDialog open onOpenChange={(o) => !o && !pending && onClose()}>
      <AdminDialogContent
        icon={LayoutGrid}
        size="lg"
        title={t("title")}
        description={t("subtitle", { count, max: MAX })}
        closeAriaLabel={t("closeAria")}>
        {/* Body */}
        <div style={{ maxHeight: "min(60vh, 540px)", overflowY: "auto" }}>
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
                  }}>
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
              }}>
              {error}
            </p>
          )}
        </div>

        {/* Footer custom (reset a sinistra, cancel+save a destra). Non
            usiamo lo slot footer di AdminDialogContent perché ci serve
            layout space-between. */}
        <div
          className="flex items-center justify-between gap-2 px-5 py-3 mt-2 -mx-5 -mb-4"
          style={{ borderTop: "1px solid var(--admin-card-border)" }}>
          <div>
            {hasUserOverride && (
              <button
                onClick={handleReset}
                disabled={pending}
                title={t("resetTooltip")}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg disabled:opacity-50"
                style={{
                  border: "1px solid var(--admin-card-border)",
                  background: "transparent",
                  color: "var(--admin-text-muted)",
                }}>
                <RotateCcw size={12} />
                {t("resetButton")}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <AdminDialogCancelButton onClick={onClose} disabled={pending}>
              {t("cancelButton")}
            </AdminDialogCancelButton>
            <AdminDialogConfirmButton
              onClick={handleSave}
              disabled={pending}
              loading={pending}>
              {t("saveButton")}
            </AdminDialogConfirmButton>
          </div>
        </div>
      </AdminDialogContent>
    </AdminDialog>
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
