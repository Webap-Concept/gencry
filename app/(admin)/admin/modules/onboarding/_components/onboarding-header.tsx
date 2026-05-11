"use client";

import { Sparkles } from "lucide-react";

export function OnboardingHeader() {
  return (
    <div className="flex items-center gap-3">
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{
          background: "color-mix(in srgb, var(--admin-accent) 12%, var(--admin-card-bg))",
          border: "1px solid color-mix(in srgb, var(--admin-accent) 25%, transparent)",
        }}>
        <Sparkles size={18} style={{ color: "var(--admin-accent)" }} />
      </div>
      <div>
        <h2 className="text-lg font-bold" style={{ color: "var(--admin-text)" }}>
          Onboarding
        </h2>
        <p className="text-sm mt-0.5" style={{ color: "var(--admin-text-faint)" }}>
          Post-signup wizard configuration. Optional, can be disabled per-deploy.
        </p>
      </div>
    </div>
  );
}
