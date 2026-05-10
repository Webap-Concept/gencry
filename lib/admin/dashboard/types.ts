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
  /** Optional i18n BASE key pointing to a setup guide object (see WidgetSetupGuide).
   *  When set, the customize modal shows an Info button next to the toggle and the
   *  widget runtime can render the same guide inline if its config is missing. */
  setupGuideKey?: string;
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
