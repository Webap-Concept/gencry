"use client";
// app/(admin)/admin/modules/posts/_components/posts-media-form.tsx
//
// Form admin per limits content/media del modulo Posts:
//   - max body length post (CHECK schema 1..5000)
//   - max images per post (1..10)
//   - edit window minutes (0..1440)
//
// Capacity profile scope: "media".
import { useState, useTransition } from "react";
import { AdminButton } from "@/app/(admin)/admin/_components/admin-button";
import type {
  CapacityPreset,
  CapacityProfile,
  CapacityTier,
} from "@/lib/modules/types";
import { CapacityProfileHeader } from "./capacity-profile-header";
import { saveMediaSettings } from "../actions";

export type PostsMediaFormInitial = {
  maxBodyLength: number;
  maxImagesPerPost: number;
  editWindowMinutes: number;
};

export function PostsMediaForm({
  initial,
  capacityProfile,
  currentTier,
}: {
  initial: PostsMediaFormInitial;
  capacityProfile?: CapacityProfile;
  currentTier?: CapacityTier | "custom";
}) {
  const [maxBodyLength, setMaxBodyLength] = useState(initial.maxBodyLength);
  const [maxImagesPerPost, setMaxImagesPerPost] = useState(initial.maxImagesPerPost);
  const [editWindowMinutes, setEditWindowMinutes] = useState(initial.editWindowMinutes);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function applyPreset(preset: CapacityPreset) {
    const v = preset.values;
    if (v["modules.posts.max_body_length"]) setMaxBodyLength(Number(v["modules.posts.max_body_length"]));
    if (v["modules.posts.max_images_per_post"]) setMaxImagesPerPost(Number(v["modules.posts.max_images_per_post"]));
    if (v["modules.posts.edit_window_minutes"]) setEditWindowMinutes(Number(v["modules.posts.edit_window_minutes"]));
    setSaved(false);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await saveMediaSettings({
        maxBodyLength,
        maxImagesPerPost,
        editWindowMinutes,
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
          Media &amp; content limits
        </h2>
        <p className="text-sm text-[var(--admin-text-muted)] mt-1">
          Lunghezza body post, max immagini per post, finestra di edit.
          Tradeoff product (UX permissiva) vs infra (ops R2 + Vercel sharp).
        </p>
      </header>

      {capacityProfile ? (
        <CapacityProfileHeader
          profile={capacityProfile}
          currentTier={currentTier}
          onApplyPreset={applyPreset}
        />
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <NumberField label="Max body length (char, 280..5000)"  value={maxBodyLength}     onChange={setMaxBodyLength}     min={280} max={5000} />
        <NumberField label="Max immagini per post (1..10)"      value={maxImagesPerPost}  onChange={setMaxImagesPerPost}  min={1}   max={10}   />
        <NumberField label="Edit window post (min, 0..1440, 0=disabled)" value={editWindowMinutes} onChange={setEditWindowMinutes} min={0} max={1440} />
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
