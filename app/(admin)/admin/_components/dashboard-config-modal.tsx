"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Info, LayoutDashboard, RotateCcw } from "lucide-react";
import type {
  WidgetMeta,
  WidgetSetupGuide as WidgetSetupGuideData,
} from "@/lib/admin/dashboard/types";
import {
  AdminDialog,
  AdminDialogCancelButton,
  AdminDialogConfirmButton,
  AdminDialogContent,
} from "./admin-dialog";
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

  // Resync local state when the modal is reopened after a save/reset cycle.
  useEffect(() => {
    if (open) {
      setEnabled(new Set(initialEnabled));
      setOpenGuides(new Set());
      setError(null);
    }
  }, [open, initialEnabled]);

  // Focus + ESC delegati a Radix tramite AdminDialog.

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

  return (
    <AdminDialog open onOpenChange={(o) => !o && !pending && onClose()}>
      <AdminDialogContent
        icon={LayoutDashboard}
        size="lg"
        title={t("title")}
        description={t("subtitle")}
        closeAriaLabel={t("closeAria")}>
        <div style={{ maxHeight: "min(60vh, 600px)", overflowY: "auto" }}>
          {visibleWidgets.length === 0 ? (
            <p
              style={{
                fontSize: "13px",
                color: "var(--admin-text-faint)",
                textAlign: "center",
                padding: "30px 10px",
              }}>
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
              }}>
              {error}
            </p>
          )}
        </div>

        {/* Footer custom (reset a sinistra, cancel+save a destra). */}
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
