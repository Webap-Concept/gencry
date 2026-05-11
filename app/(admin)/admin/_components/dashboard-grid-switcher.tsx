"use client";

import type { ReactNode } from "react";
import { GRID_COLS } from "@/lib/admin/dashboard/types";
import DashboardEditGrid from "./dashboard-edit-grid";
import { useDashboardEditMode } from "./dashboard-edit-mode-context";

const ROW_HEIGHT_PX = 60;
const GRID_GAP_PX = 16;

/**
 * Renders the dashboard widgets either as a static CSS Grid (read-only)
 * or as a draggable react-grid-layout (edit mode).
 *
 * The static path keeps the bundle small for the common case; RGL is
 * dynamically imported only when the user enters edit mode.
 *
 * Mobile: under 768px viewport the static grid collapses to a single
 * column with auto rows, ignoring the saved x/y/w/h. RGL has its own
 * responsive behavior in edit mode but we don't expose breakpoint
 * editing in v1 — everyone edits the desktop layout.
 */
export default function DashboardGridSwitcher({
  widgetsById,
}: {
  widgetsById: Record<string, ReactNode>;
}) {
  const { editMode, items } = useDashboardEditMode();

  if (editMode) {
    return <DashboardEditGrid widgetsById={widgetsById} />;
  }

  return (
    <div
      className="dashboard-grid-static"
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)`,
        gridAutoRows: `${ROW_HEIGHT_PX}px`,
        gap: GRID_GAP_PX,
      }}
    >
      {items.map((it) => (
        <div
          key={it.id}
          className="dashboard-widget-cell"
          style={{
            gridColumn: `${it.x + 1} / span ${it.w}`,
            gridRow: `${it.y + 1} / span ${it.h}`,
          }}
        >
          {widgetsById[it.id] ?? null}
        </div>
      ))}
    </div>
  );
}
