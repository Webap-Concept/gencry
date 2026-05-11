import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Standard internal structure for an admin dashboard widget.
 *
 * What WidgetCard does NOT do: it never paints the outer card chrome
 * (background, border, border-radius). That lives on the grid cell
 * wrapper (see DashboardGridSwitcher / DashboardEditGrid) so that the
 * chrome is uniform across widgets and in sync with edit-mode styling.
 *
 * What WidgetCard DOES do:
 *  - Fills the height of the grid cell (h-full + flex column).
 *  - Provides consistent inner padding.
 *  - Renders an optional header (24×24-ish accent badge + uppercase title).
 *  - Routes children into a body region that can either fit the rest of
 *    the cell exactly (`scrollable: false`, default) or scroll its own
 *    overflow without affecting the card frame (`scrollable: true`).
 *
 * Widgets that need a completely different inner structure can skip
 * this component entirely and write their own — the card chrome is
 * still applied by the cell wrapper above. WidgetCard is just the
 * recommended fast path so new widgets compose with one import.
 */
export interface WidgetCardProps {
  /** Optional uppercase title shown in the header row. */
  title?: string;
  /** Optional lucide icon rendered in a small accent-tinted badge next to the title. */
  icon?: LucideIcon;
  /** When true, the body region becomes a scroll container (used for
   *  widgets with potentially-long content like activity lists). */
  scrollable?: boolean;
  children: ReactNode;
}

export default function WidgetCard({
  title,
  icon: Icon,
  scrollable = false,
  children,
}: WidgetCardProps) {
  const hasHeader = !!title || !!Icon;

  return (
    <div className="h-full flex flex-col p-5">
      {hasHeader && (
        <div className="flex items-center gap-2.5 mb-3 shrink-0">
          {Icon && (
            <span
              className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
              style={{
                background:
                  "color-mix(in srgb, var(--admin-accent) 12%, transparent)",
                color: "var(--admin-accent)",
              }}
            >
              <Icon size={14} />
            </span>
          )}
          {title && (
            <h2
              className="text-xs font-semibold uppercase tracking-widest"
              style={{ color: "var(--admin-text-faint)" }}
            >
              {title}
            </h2>
          )}
        </div>
      )}

      {scrollable ? (
        <div className="flex-1 min-h-0 overflow-auto">{children}</div>
      ) : (
        <div className="min-h-0">{children}</div>
      )}
    </div>
  );
}
