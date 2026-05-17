"use client";
// app/(admin)/admin/modules/posts/_components/capacity-profile-header.tsx
//
// Componente condiviso per il header "Capacity Profile" dei form admin
// dei tunables di scala. Mostra:
//   - Tier corrente come badge
//   - Bottoni preset (alpha/beta/growth/scale) — applicano valori al
//     form callback `onApplyPreset` SENZA salvare (l'utente clicca Salva)
//   - Disclosure con dettaglio delle risorse esterne (limits + upgradeAt
//     + upgradePath + docs link)
//
// Estratto dal form Comments per riuso cross-scope (rate-limits,
// retention, media). Vedi memoria feedback_capacity_profile_pattern.
import { AdminButton } from "@/app/(admin)/admin/_components/admin-button";
import type { CapacityPreset, CapacityProfile } from "@/lib/modules/types";

export type CapacityProfileHeaderProps = {
  profile: CapacityProfile;
  /** Callback invocato dal click su un preset. Il caller setta i suoi
   *  state in base ai `preset.values` (mappa setting_key → string). */
  onApplyPreset: (preset: CapacityPreset) => void;
};

export function CapacityProfileHeader({
  profile,
  onApplyPreset,
}: CapacityProfileHeaderProps) {
  return (
    <div className="rounded-md border border-[var(--admin-card-border)] bg-[var(--admin-input-bg)] p-3 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs uppercase tracking-wide text-[var(--admin-text-muted)]">
          Tier corrente:
        </span>
        <span
          className="inline-block text-xs font-semibold rounded px-2 py-0.5"
          style={{
            background:
              "color-mix(in srgb, var(--admin-accent) 15%, transparent)",
            color: "var(--admin-accent)",
          }}>
          {profile.currentTier}
        </span>
        <span className="text-xs text-[var(--admin-text-muted)] sm:ml-auto">
          Applica preset di calibrazione:
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {profile.presets.map((p) => (
          <AdminButton
            key={p.id}
            type="button"
            variant={p.id === profile.currentTier ? "primary" : "secondary"}
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
          Risorse esterne usate ({profile.resources.length})
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
                Limiti: {r.limits.join(" · ")}
              </div>
              <div className="text-[var(--admin-text-muted)]">
                Upgrade a: {r.upgradeAt}
              </div>
              <div className="text-[var(--admin-text-muted)]">
                Cosa fare: {r.upgradePath}
              </div>
              {r.docsUrl ? (
                <a
                  href={r.docsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--admin-accent)] hover:underline"
                >
                  Docs ↗
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
