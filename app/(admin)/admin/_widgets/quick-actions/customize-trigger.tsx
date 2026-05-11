"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { Settings } from "lucide-react";

// Lazy-load the modal so its body — including the full NAV_ICON_MAP
// from lucide-react and its grouped option list — doesn't ship in the
// initial admin home client bundle. The dashboard renders just the
// gear icon up-front; the modal code is fetched the first time the
// user actually opens it.
const CustomizeModal = dynamic(() => import("./customize-modal"), {
  ssr: false,
});

export interface QuickActionOptionView {
  key: string;
  groupKey: string;
  groupLabel: string;
  label: string;
  icon: string;
}

export interface CustomizeTriggerProps {
  available: ReadonlyArray<QuickActionOptionView>;
  initialSelected: ReadonlyArray<string>;
  hasUserOverride: boolean;
}

export default function CustomizeTrigger({
  available,
  initialSelected,
  hasUserOverride,
}: CustomizeTriggerProps) {
  const t = useTranslations("admin.dashboard.widgets.quickActions");
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("customizeAria")}
        title={t("customizeAria")}
        // The trigger lives in WidgetCard's header slot; keep the
        // surface compact (24px) so it doesn't compete with the title.
        // Inline styles because :hover would otherwise need its own
        // class in admin.css for a single use.
        className="quick-actions-customize-btn"
      >
        <Settings size={13} />
      </button>

      <style>{`
        .quick-actions-customize-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          border: none;
          background: transparent;
          border-radius: 6px;
          color: var(--admin-text-faint);
          cursor: pointer;
          transition: background-color 140ms ease, color 140ms ease;
        }
        .quick-actions-customize-btn:hover {
          background: color-mix(in srgb, var(--admin-accent) 12%, transparent);
          color: var(--admin-accent);
        }
        .quick-actions-customize-btn:focus-visible {
          outline: 2px solid var(--admin-accent);
          outline-offset: 2px;
        }
      `}</style>

      {open && (
        <CustomizeModal
          open={open}
          onClose={() => setOpen(false)}
          available={available}
          initialSelected={initialSelected}
          hasUserOverride={hasUserOverride}
        />
      )}
    </>
  );
}
