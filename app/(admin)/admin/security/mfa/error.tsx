"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import { useEffect } from "react";

export default function MfaError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[admin/security/mfa] error:", error);
  }, [error]);

  return (
    <div className="space-y-5">
      <div
        className="rounded-xl shadow-sm p-6"
        style={{
          background: "var(--admin-card-bg)",
          border: "1px solid var(--admin-card-border)",
        }}>
        <div className="flex items-start gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: "rgba(220, 38, 38, 0.1)" }}>
            <AlertTriangle className="w-5 h-5" style={{ color: "#dc2626" }} />
          </div>
          <div className="flex-1 min-w-0">
            <h2
              className="text-base font-semibold mb-1"
              style={{ color: "var(--admin-text)" }}>
              Could not load the MFA admin page
            </h2>
            <p
              className="text-sm mb-3"
              style={{ color: "var(--admin-text-muted)" }}>
              {error.message ||
                "An unexpected error occurred while loading MFA settings or statistics."}
            </p>
            {error.digest && (
              <p
                className="text-xs font-mono mb-4"
                style={{ color: "var(--admin-text-faint)" }}>
                digest: {error.digest}
              </p>
            )}
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
              style={{ background: "var(--admin-accent)" }}>
              <RefreshCw className="w-4 h-4" />
              Try again
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
