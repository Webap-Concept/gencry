"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertOctagon } from "lucide-react";

/**
 * Per-widget isolation boundary for the dashboard. Two guarantees:
 *
 *  1. Failure containment — if a widget's RSC subtree throws (DB call
 *     timed out, third-party API responded with garbage, etc.) only
 *     that widget renders the error fallback. The dashboard around it
 *     keeps rendering normally.
 *
 *  2. Streaming-friendly loading — each widget gets its own Suspense
 *     boundary via the parent's <Suspense>, so the slow ones don't
 *     hold up the fast ones. This class component is the ErrorBoundary
 *     wrapper (React requires class for error boundaries).
 *
 * Server vs client: ErrorBoundary must be a class component, which
 * forces "use client". The wrapped widget itself stays a Server
 * Component — React 19 passes RSC children through client components
 * transparently. The error label text is passed in as a string prop so
 * the boundary doesn't need to call useTranslations.
 */
export interface WidgetIsolatorProps {
  /** Localized "couldn't load this widget" copy. */
  fallbackLabel: string;
  children: ReactNode;
}

interface WidgetIsolatorState {
  hasError: boolean;
}

export default class WidgetIsolator extends Component<
  WidgetIsolatorProps,
  WidgetIsolatorState
> {
  state: WidgetIsolatorState = { hasError: false };

  static getDerivedStateFromError(): WidgetIsolatorState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surface in the browser console with enough breadcrumbs that the
    // admin can grep for it. Avoid noisy error tracking pings here —
    // Sentry will already pick up the throw via Next's instrumentation.
    // eslint-disable-next-line no-console
    console.error("[WidgetIsolator] widget crashed", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-full flex items-center justify-center p-5">
          <div
            className="flex items-center gap-2.5"
            style={{ color: "var(--admin-text-muted)" }}
          >
            <AlertOctagon size={15} style={{ color: "#ef4444" }} />
            <span style={{ fontSize: 12 }}>{this.props.fallbackLabel}</span>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
