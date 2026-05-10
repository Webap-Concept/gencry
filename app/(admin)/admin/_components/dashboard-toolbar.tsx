"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Check, LayoutGrid, Settings2, X } from "lucide-react";
import type { WidgetMeta } from "@/lib/admin/dashboard/types";
import DashboardConfigModal from "./dashboard-config-modal";
import { useDashboardEditMode } from "./dashboard-edit-mode-context";
import { saveUserDashboardLayout } from "../actions";

export interface DashboardToolbarProps {
  visibleWidgets: ReadonlyArray<WidgetMeta>;
  initialEnabled: ReadonlyArray<string>;
  hasUserOverride: boolean;
}

export default function DashboardToolbar({
  visibleWidgets,
  initialEnabled,
  hasUserOverride,
}: DashboardToolbarProps) {
  const t = useTranslations("admin.dashboard");
  const { editMode, items, enterEdit, cancel, commit } = useDashboardEditMode();
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);
  const router = useRouter();

  function handleSaveLayout() {
    setSaveError(null);
    startTransition(async () => {
      const res = await saveUserDashboardLayout([...items]);
      if ("error" in res) {
        setSaveError(t("editLayout.saveError"));
        return;
      }
      commit();
      router.refresh();
    });
  }

  if (editMode) {
    // In edit mode the toolbar morphs into Save / Cancel.
    return (
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {saveError && (
          <span style={{ fontSize: 11, color: "#ef4444" }}>{saveError}</span>
        )}
        <button
          onClick={cancel}
          disabled={pending}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
          style={{
            background: "var(--admin-card-bg)",
            border: "1px solid var(--admin-card-border)",
            color: "var(--admin-text-muted)",
          }}
        >
          <X size={13} />
          {t("editLayout.cancelButton")}
        </button>
        <button
          onClick={handleSaveLayout}
          disabled={pending}
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
          style={{
            background: pending ? "#6b7280" : "var(--admin-accent)",
            color: "#fff",
            border: "none",
          }}
        >
          <Check size={13} />
          {pending ? t("editLayout.savingLabel") : t("editLayout.saveButton")}
        </button>
      </div>
    );
  }

  return (
    <>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={() => setCustomizeOpen(true)}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
          style={{
            background: "var(--admin-card-bg)",
            border: "1px solid var(--admin-card-border)",
            color: "var(--admin-text-muted)",
          }}
        >
          <Settings2 size={13} />
          {t("customizeButton")}
        </button>
        <button
          onClick={enterEdit}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
          style={{
            background: "var(--admin-card-bg)",
            border: "1px solid var(--admin-card-border)",
            color: "var(--admin-text-muted)",
          }}
        >
          <LayoutGrid size={13} />
          {t("editLayout.button")}
        </button>
      </div>
      <DashboardConfigModal
        open={customizeOpen}
        onClose={() => setCustomizeOpen(false)}
        visibleWidgets={visibleWidgets}
        initialEnabled={initialEnabled}
        hasUserOverride={hasUserOverride}
      />
    </>
  );
}
