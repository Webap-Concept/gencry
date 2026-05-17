"use client";
// app/(admin)/admin/modules/posts/_components/posts-rate-limits-form.tsx
//
// Form admin per i rate-limit del modulo Posts (sliding window via
// Upstash KV — oggi service rate-limit.ts è stub pass-through, swap
// quando attiveremo Upstash).
//
// Capacity profile scope: "rate-limits".
import { useState, useTransition } from "react";
import { AdminButton } from "@/app/(admin)/admin/_components/admin-button";
import type { CapacityPreset, CapacityProfile } from "@/lib/modules/types";
import { CapacityProfileHeader } from "./capacity-profile-header";
import { saveRateLimitsSettings } from "../actions";

export type PostsRateLimitsFormInitial = {
  postPerHour: number;
  reactionPerMin: number;
  commentPerMin: number;
  repostPerHour: number;
  reportPerHour: number;
  mediaPerHour: number;
};

export function PostsRateLimitsForm({
  initial,
  capacityProfile,
}: {
  initial: PostsRateLimitsFormInitial;
  capacityProfile?: CapacityProfile;
}) {
  const [postPerHour, setPostPerHour] = useState(initial.postPerHour);
  const [reactionPerMin, setReactionPerMin] = useState(initial.reactionPerMin);
  const [commentPerMin, setCommentPerMin] = useState(initial.commentPerMin);
  const [repostPerHour, setRepostPerHour] = useState(initial.repostPerHour);
  const [reportPerHour, setReportPerHour] = useState(initial.reportPerHour);
  const [mediaPerHour, setMediaPerHour] = useState(initial.mediaPerHour);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function applyPreset(preset: CapacityPreset) {
    const v = preset.values;
    if (v["modules.posts.rate_limit_post_per_hour"]) setPostPerHour(Number(v["modules.posts.rate_limit_post_per_hour"]));
    if (v["modules.posts.rate_limit_reaction_per_min"]) setReactionPerMin(Number(v["modules.posts.rate_limit_reaction_per_min"]));
    if (v["modules.posts.rate_limit_comment_per_min"]) setCommentPerMin(Number(v["modules.posts.rate_limit_comment_per_min"]));
    if (v["modules.posts.rate_limit_repost_per_hour"]) setRepostPerHour(Number(v["modules.posts.rate_limit_repost_per_hour"]));
    if (v["modules.posts.rate_limit_report_per_hour"]) setReportPerHour(Number(v["modules.posts.rate_limit_report_per_hour"]));
    if (v["modules.posts.rate_limit_media_per_hour"]) setMediaPerHour(Number(v["modules.posts.rate_limit_media_per_hour"]));
    setSaved(false);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await saveRateLimitsSettings({
        postPerHour,
        reactionPerMin,
        commentPerMin,
        repostPerHour,
        reportPerHour,
        mediaPerHour,
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
          Rate limiting (anti-spam)
        </h2>
        <p className="text-sm text-[var(--admin-text-muted)] mt-1">
          Sliding window per ogni write action. Backed da Upstash KV
          quando attivato — oggi stub pass-through.
        </p>
      </header>

      {capacityProfile ? (
        <CapacityProfileHeader
          profile={capacityProfile}
          onApplyPreset={applyPreset}
        />
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <NumberField label="Post per ora (1..1000)"      value={postPerHour}    onChange={setPostPerHour}    min={1} max={1000} />
        <NumberField label="Reaction per min (1..1000)"  value={reactionPerMin} onChange={setReactionPerMin} min={1} max={1000} />
        <NumberField label="Comment per min (1..1000)"   value={commentPerMin}  onChange={setCommentPerMin}  min={1} max={1000} />
        <NumberField label="Repost per ora (1..1000)"    value={repostPerHour}  onChange={setRepostPerHour}  min={1} max={1000} />
        <NumberField label="Report per ora (1..1000)"    value={reportPerHour}  onChange={setReportPerHour}  min={1} max={1000} />
        <NumberField label="Media upload per ora (1..1000)" value={mediaPerHour} onChange={setMediaPerHour} min={1} max={1000} />
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
