"use client";

import { useMemo, type ReactNode } from "react";
import dynamic from "next/dynamic";
import type { Layout, LayoutItem } from "react-grid-layout/legacy";
import { GRID_COLS, type WidgetItem } from "@/lib/admin/dashboard/types";
import { useDashboardEditMode } from "./dashboard-edit-mode-context";

// Dynamic import of react-grid-layout (legacy/v1-compat surface so we
// keep the WidthProvider HOC API). ssr:false because the HOC measures
// the container with `window`, and we don't want it in the client
// bundle of users that never click "Edit Layout".
const ResponsiveGrid = dynamic(
  async () => {
    const mod = await import("react-grid-layout/legacy");
    return { default: mod.WidthProvider(mod.default) };
  },
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          height: 200,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--admin-text-faint)",
          fontSize: 12,
        }}
      >
        …
      </div>
    ),
  },
);

const ROW_HEIGHT = 60;

export default function DashboardEditGrid({
  widgetsById,
}: {
  widgetsById: Record<string, ReactNode>;
}) {
  const { items, setDraft } = useDashboardEditMode();

  // RGL wants `i` as the key; we use the widget id verbatim.
  const layout: LayoutItem[] = useMemo(
    () =>
      items.map((it) => ({
        i: it.id,
        x: it.x,
        y: it.y,
        w: it.w,
        h: it.h,
        minW: 2,
        minH: 1,
      })),
    [items],
  );

  function handleLayoutChange(next: Layout) {
    // Translate RGL's Layout back into our WidgetItem[]. Preserve insertion
    // order from `next` (RGL keeps it stable) and skip ids RGL might
    // emit that aren't in our registry (shouldn't happen but defensive).
    const validIds = new Set(items.map((it) => it.id));
    const translated: WidgetItem[] = [];
    for (const l of next) {
      if (!validIds.has(l.i)) continue;
      translated.push({ id: l.i, x: l.x, y: l.y, w: l.w, h: l.h });
    }
    setDraft(translated);
  }

  return (
    <ResponsiveGrid
      className="dashboard-grid-edit"
      layout={layout}
      cols={GRID_COLS}
      rowHeight={ROW_HEIGHT}
      margin={[16, 16]}
      compactType="vertical"
      isDraggable
      isResizable
      onLayoutChange={handleLayoutChange}
      // Drag handle: anywhere on the widget except its action buttons.
      // The selector is loose so users can grab the card body.
      draggableCancel="a, button, input, textarea, select"
    >
      {items.map((it) => (
        <div
          key={it.id}
          style={{
            border: "2px dashed color-mix(in srgb, var(--admin-accent) 50%, transparent)",
            borderRadius: 12,
            background: "var(--admin-card-bg)",
            overflow: "hidden",
            cursor: "move",
          }}
        >
          {widgetsById[it.id] ?? null}
        </div>
      ))}
    </ResponsiveGrid>
  );
}
