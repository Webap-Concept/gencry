"use client";
// app/(admin)/admin/modules/posts/_components/posts-retention-form.tsx
//
// Form admin per retention/cleanup del modulo Posts:
//   - outbox retention days (consumer-side notifications)
//   - orphan media grace hours (R2 cleanup cron)
//   - deleted grace days (Twitter-style restore window)
//   - link preview cache days (re-fetch OG)
//
// Capacity profile scope: "retention".
import { useState, useTransition } from "react";
import { AdminButton } from "@/app/(admin)/admin/_components/admin-button";
import type { CapacityPreset, CapacityProfile } from "@/lib/modules/types";
import { CapacityProfileHeader } from "./capacity-profile-header";
import { saveRetentionSettings } from "../actions";

export type PostsRetentionFormInitial = {
  outboxRetentionDays: number;
  orphanMediaGraceHours: number;
  deletedGraceDays: number;
  linkPreviewCacheDays: number;
};

export function PostsRetentionForm({
  initial,
  capacityProfile,
}: {
  initial: PostsRetentionFormInitial;
  capacityProfile?: CapacityProfile;
}) {
  const [outboxRetentionDays, setOutboxRetentionDays] = useState(initial.outboxRetentionDays);
  const [orphanMediaGraceHours, setOrphanMediaGraceHours] = useState(initial.orphanMediaGraceHours);
  const [deletedGraceDays, setDeletedGraceDays] = useState(initial.deletedGraceDays);
  const [linkPreviewCacheDays, setLinkPreviewCacheDays] = useState(initial.linkPreviewCacheDays);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function applyPreset(preset: CapacityPreset) {
    const v = preset.values;
    if (v["modules.posts.outbox_retention_days"]) setOutboxRetentionDays(Number(v["modules.posts.outbox_retention_days"]));
    if (v["modules.posts.orphan_media_grace_hours"]) setOrphanMediaGraceHours(Number(v["modules.posts.orphan_media_grace_hours"]));
    if (v["modules.posts.deleted_grace_days"]) setDeletedGraceDays(Number(v["modules.posts.deleted_grace_days"]));
    if (v["modules.posts.link_preview_cache_days"]) setLinkPreviewCacheDays(Number(v["modules.posts.link_preview_cache_days"]));
    setSaved(false);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await saveRetentionSettings({
        outboxRetentionDays,
        orphanMediaGraceHours,
        deletedGraceDays,
        linkPreviewCacheDays,
      });
      if (!res.ok) setError(res.error);
      else setSaved(true);
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-lg border border-[var(--admin-card-border)] bg-[var(--admin-card-bg)] p-5 space-y-4 max-w-[720px]"
    >
      <header>
        <h2 className="text-lg font-semibold text-[var(--admin-text)]">
          Retention &amp; cleanup
        </h2>
        <p className="text-sm text-[var(--admin-text-muted)] mt-1">
          Quanto teniamo eventi outbox, media orfani, post soft-deleted,
          cache link preview. Cron giornalieri li puliscono.
        </p>
      </header>

      {capacityProfile ? (
        <CapacityProfileHeader
          profile={capacityProfile}
          onApplyPreset={applyPreset}
        />
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <NumberField label="Outbox retention (days, 1..365)"      value={outboxRetentionDays}   onChange={setOutboxRetentionDays}   min={1} max={365} />
        <NumberField label="Orphan media grace (hours, 1..168)"   value={orphanMediaGraceHours} onChange={setOrphanMediaGraceHours} min={1} max={168} />
        <NumberField label="Deleted post grace (days, 1..90)"     value={deletedGraceDays}      onChange={setDeletedGraceDays}      min={1} max={90}  />
        <NumberField label="Link preview cache (days, 1..365)"    value={linkPreviewCacheDays}  onChange={setLinkPreviewCacheDays}  min={1} max={365} />
      </div>

      {error ? <p className="text-sm text-red-600" role="alert">{error}</p> : null}
      {saved ? <p className="text-sm text-green-600" role="status">Salvato.</p> : null}

      <div className="flex justify-end pt-2">
        <AdminButton type="submit" variant="primary" loading={isPending}>
          Salva
        </AdminButton>
      </div>
    </form>
  );
}

function NumberField({
  label, value, onChange, min, max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
}) {
  return (
    <label className="block">
      <span className="text-xs text-[var(--admin-text-muted)] block mb-1">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full bg-[var(--admin-input-bg)] border border-[var(--admin-card-border)] rounded-md px-3 py-2 text-sm text-[var(--admin-text)] outline-none focus:border-[var(--admin-accent)]"
      />
    </label>
  );
}
