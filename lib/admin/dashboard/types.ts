// Shared types for the admin dashboard widget system.
//
// Kept in lib/ (not under app/_widgets) so the resolver and any server-side
// caller can depend on the type without pulling in the whole widget registry
// (which lives under app/(admin)/admin/_widgets and imports React components).

/** Persisted shape for both `admin_user_preferences.dashboard_widgets`
 *  and `roles.dashboard_widgets`. NULL row/column = inherit lower level. */
export type DashboardWidgetsPref = { enabled: string[] };

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
};
