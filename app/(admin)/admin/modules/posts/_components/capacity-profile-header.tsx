"use client";
// app/(admin)/admin/modules/posts/_components/capacity-profile-header.tsx
//
// Shared component for the "Capacity Profile" header of admin forms for
// scale tunables. Shows:
//   - Current tier as a badge
//   - Preset buttons (alpha/beta/growth/scale) — apply values via the
//     `onApplyPreset` form callback WITHOUT saving (user clicks Save)
//   - Disclosure with external-resource details (limits + upgradeAt
//     + upgradePath + docs link)
//
// Extracted from the Comments form for cross-scope reuse (rate-limits,
// retention, media). See memory feedback_capacity_profile_pattern.
import { AdminButton } from "@/app/(admin)/admin/_components/admin-button";
import type {
  CapacityPreset,
  CapacityProfile,
  CapacityTier,
} from "@/lib/modules/types";
import { useTranslations } from "next-intl";

export type CapacityProfileHeaderProps = {
  profile: CapacityProfile;
  /** Override of the tier shown as "current". If omitted, falls back to
   *  `profile.currentTier` (static from the manifest). Server-side caller
   *  passes the value derived from
   *  `resolveCapacityCurrentTier(profile, settings)` to reflect the
   *  actual values saved in app_settings. */
  currentTier?: CapacityTier | "custom";
  /** Callback invoked on preset click. The caller updates its own state
   *  from `preset.values` (setting_key → string map). */
  onApplyPreset: (preset: CapacityPreset) => void;
};

export function CapacityProfileHeader({
  profile,
  currentTier,
  onApplyPreset,
}: CapacityProfileHeaderProps) {
  const t = useTranslations("admin.capacityProfileHeader");
  const resolvedTier = currentTier ?? profile.currentTier;
  return (
    <div className="rounded-md border border-[var(--admin-card-border)] bg-[var(--admin-input-bg)] p-3 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs uppercase tracking-wide text-[var(--admin-text-muted)]">
          {t("currentTier")}
        </span>
        <span
          className="inline-block text-xs font-semibold rounded px-2 py-0.5"
          style={{
            background:
              "color-mix(in srgb, var(--admin-accent) 15%, transparent)",
            color: "var(--admin-accent)",
          }}>
          {resolvedTier}
        </span>
        <span className="text-xs text-[var(--admin-text-muted)] sm:ml-auto">
          {t("applyPreset")}
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(profile.presets ?? []).map((p) => (
          <AdminButton
            key={p.id}
            type="button"
            variant={p.id === resolvedTier ? "primary" : "secondary"}
            size="sm"
            onClick={() => onApplyPreset(p)}
            title={p.description}
          >
            {p.label}
          </AdminButton>
        ))}
      </div>

      <details className="text-xs text-[var(--admin-text-muted)]">
        <summary className="cursor-pointer hover:text-[var(--admin-text)]">
          {t("externalResources", { count: profile.resources.length })}
        </summary>
        <ul className="mt-2 space-y-2">
          {profile.resources.map((r) => (
            <li
              key={r.name}
              className="border-l-2 border-[var(--admin-card-border)] pl-2"
            >
              <div className="font-medium text-[var(--admin-text)]">
                {r.name}{" "}
                <span className="font-normal text-[var(--admin-text-muted)]">
                  · {r.plan}
                </span>
              </div>
              <div className="text-[var(--admin-text-muted)]">
                {t("limits")}: {r.limits.join(" · ")}
              </div>
              <div className="text-[var(--admin-text-muted)]">
                {t("upgradeAt")}: {r.upgradeAt}
              </div>
              <div className="text-[var(--admin-text-muted)]">
                {t("upgradePath")}: {r.upgradePath}
              </div>
              {r.docsUrl ? (
                <a
                  href={r.docsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--admin-accent)] hover:underline"
                >
                  {t("docs")} ↗
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
