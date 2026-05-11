// Shared types for the admin dashboard widget system.
//
// Kept in lib/ (not under app/_widgets) so the resolver and any server-side
// caller can depend on the type without pulling in the whole widget registry
// (which lives under app/(admin)/admin/_widgets and imports React components).

/** A widget's position + size in the 12-column grid layout. Coordinates
 *  follow react-grid-layout's convention: `x` and `w` in column units
 *  (0..12), `y` and `h` in row units (1 row ~ 60px tall). */
export type WidgetItem = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

/** Persisted shape for both `admin_user_preferences.dashboard_widgets`
 *  and `roles.dashboard_widgets`. NULL row/column = inherit lower level.
 *
 *  Two shapes coexist for backward-compat:
 *    - LEGACY `{ enabled: string[] }` — pre-layout era, list of ids only.
 *      Treated by the resolver as "these widgets are on, use defaults".
 *    - CURRENT `{ items: WidgetItem[] }` — id + grid position + size.
 *      Written on every save once the user/admin touches the layout. */
export type DashboardWidgetsPref =
  | { enabled: string[] }
  | { items: WidgetItem[] };

/** Default grid sizing for newly-enabled widgets that don't carry a
 *  saved layout yet. Half-width × 2 rows is a balanced starting card. */
export const DEFAULT_WIDGET_SIZE = { w: 6, h: 2 } as const;

/** Total grid columns. Must match the value passed to react-grid-layout. */
export const GRID_COLS = 12;

/** Pure-data view of a widget — no React component reference. The resolver
 *  and the customize modal only need this; the page builds the full
 *  registry separately to render. */
export type WidgetMeta = {
  /** Stable id used in the persisted `enabled` array. Never rename. */
  id: string;
  /** i18n key under `admin.dashboard.widgets.<id>.title`. */
  titleKey: string;
  /** Optional short description i18n key. */
  descriptionKey?: string;
  /** Whether the widget is on by default if neither user nor role overrides exist. */
  defaultEnabled: boolean;
  /** RBAC gate — widget is filtered out if the user lacks this permission. Bypassed for super admins. */
  requiredPermission?: string;
  /** Optional i18n BASE key pointing to a setup guide object (see WidgetSetupGuide).
   *  When set, the customize modal shows an Info button next to the toggle and the
   *  widget runtime can render the same guide inline if its config is missing. */
  setupGuideKey?: string;
  /** Optional per-widget override of DEFAULT_WIDGET_SIZE used the first
   *  time this widget is placed on the grid (no saved layout yet). Use
   *  for widgets that need more vertical room than the default 6×2.
   *  Users can still resize freely afterwards. */
  defaultSize?: { w: number; h: number };
};

/** JSON shape stored under `setupGuideKey` in the i18n messages.
 *  Read via `useTranslations(...).raw(key)` and rendered by the
 *  WidgetSetupGuide component. All fields except `intro` are optional;
 *  the renderer skips empty sections cleanly. */
export type WidgetSetupGuide = {
  /** Short paragraph explaining what the widget needs. */
  intro: string;
  /** Required environment variables (or DB settings). */
  env?: Array<{ name: string; hint: string }>;
  /** External documentation URL (Sentry, Vercel, etc.). */
  docsUrl?: string;
  /** Short message shown inside the widget body when the config is
   *  missing — kept terse since the full guide is one click away. */
  missingConfigShort?: string;
};
