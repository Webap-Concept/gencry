import "server-only";
import type { ComponentType } from "react";
import WelcomeWidget from "./welcome/widget";
import QuickActionsWidget from "./quick-actions/widget";
import HealthServicesWidget from "./health-services/widget";
import OperationalMetricsWidget from "./operational-metrics/widget";
import SignupsTrendWidget from "./signups-trend/widget";
import RecentSignupsWidget from "./recent-signups/widget";
import SuspiciousSessionsWidget from "./suspicious-sessions/widget";
import GdprExportsWidget from "./gdpr-exports/widget";
import SentryErrorsWidget from "./sentry-errors/widget";

// Server-only mapping from widget id → component. Kept apart from meta.ts
// so the customize modal (client) can import metadata without dragging in
// every widget's server bundle.
//
// To add a widget: append an entry to DASHBOARD_WIDGETS_META in meta.ts AND
// register its component here.

export const WIDGET_COMPONENTS: Record<string, ComponentType> = {
  "welcome": WelcomeWidget,
  "quick-actions": QuickActionsWidget,
  "health-services": HealthServicesWidget,
  "operational-metrics": OperationalMetricsWidget,
  "signups-trend": SignupsTrendWidget,
  "recent-signups": RecentSignupsWidget,
  "suspicious-sessions": SuspiciousSessionsWidget,
  "gdpr-exports": GdprExportsWidget,
  "sentry-errors": SentryErrorsWidget,
};
