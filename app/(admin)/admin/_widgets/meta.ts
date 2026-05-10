import type { WidgetMeta } from "@/lib/admin/dashboard/types";

// Pure metadata for the dashboard widget registry.
//
// Why split from registry.tsx: this file is imported by both the page
// (server) and the customize modal (client). Keeping React component
// references out of here means the client modal never pulls server-only
// widget code into its bundle.
//
// Adding a widget = add an entry here AND a mapping in registry.tsx.
// The `id` field is persisted in DB — never rename it.

export const DASHBOARD_WIDGETS_META: ReadonlyArray<WidgetMeta> = [
  {
    id: "welcome",
    titleKey: "widgets.welcome.title",
    descriptionKey: "widgets.welcome.description",
    defaultEnabled: true,
  },
  {
    id: "quick-actions",
    titleKey: "widgets.quickActions.title",
    descriptionKey: "widgets.quickActions.description",
    defaultEnabled: true,
  },
];
