"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Settings2 } from "lucide-react";
import type { WidgetMeta } from "@/lib/admin/dashboard/types";
import DashboardConfigModal from "./dashboard-config-modal";

export interface DashboardCustomizeButtonProps {
  visibleWidgets: ReadonlyArray<WidgetMeta>;
  initialEnabled: ReadonlyArray<string>;
  hasUserOverride: boolean;
}

export default function DashboardCustomizeButton({
  visibleWidgets,
  initialEnabled,
  hasUserOverride,
}: DashboardCustomizeButtonProps) {
  const t = useTranslations("admin.dashboard");
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
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
      <DashboardConfigModal
        open={open}
        onClose={() => setOpen(false)}
        visibleWidgets={visibleWidgets}
        initialEnabled={initialEnabled}
        hasUserOverride={hasUserOverride}
      />
    </>
  );
}
