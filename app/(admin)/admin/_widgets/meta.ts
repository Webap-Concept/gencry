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
    // Four shortcuts in a 2×2 grid + header don't fit in the default
    // 2-row card — bump initial h to 3.
    defaultSize: { w: 6, h: 3 },
  },
  {
    id: "health-services",
    titleKey: "widgets.healthServices.title",
    descriptionKey: "widgets.healthServices.description",
    defaultEnabled: true,
    // 6 service rows + summary need a touch more height than the default 2.
    defaultSize: { w: 6, h: 4 },
  },
  {
    id: "sentry-errors",
    titleKey: "widgets.sentryErrors.title",
    descriptionKey: "widgets.sentryErrors.description",
    // Off by default: requires Vercel env vars, no point showing a
    // "missing config" card to admins that haven't set them up yet.
    // Each user can flip it on from Customize once configured.
    defaultEnabled: false,
    requiredPermission: "admin:sentry",
    setupGuideKey: "widgets.sentryErrors.setupGuide",
    // Issue list reads better with extra vertical room; users can still
    // shrink, the body scrolls internally.
    defaultSize: { w: 6, h: 4 },
  },
];
