"use client";
// app/(admin)/admin/modules/posts/_components/posts-comments-settings-form.tsx
//
// Form admin per i settings del thread commenti + Capacity Profile.
//
// Capacity Profile (header in cima): mostra risorse esterne usate + il
// loro stato di scala (limiti correnti + soglie di upgrade). Bottoni
// "Apply preset" caricano valori coerenti con uno specifico tier (alpha
// / beta / growth / scale) — non salvano direttamente: l'utente vede i
// campi cambiare e clicca Salva per applicare.
//
// Token CSS: --admin-card-bg, --admin-card-border, --admin-text,
// --admin-text-muted, --admin-input-bg, --admin-accent.
// Bottoni: <AdminButton> primitive (regola feedback_admin_button_primitive).
import { useState, useTransition } from "react";
import { AdminButton } from "@/app/(admin)/admin/_components/admin-button";
import type { CapacityPreset, CapacityProfile } from "@/lib/modules/types";
import { CapacityProfileHeader } from "./capacity-profile-header";
import { saveCommentsSettings } from "../actions";

export type PostsCommentsSettingsFormInitial = {
  liveModePostPage: "subscribe" | "poll" | "off";
  liveModeFeed: "subscribe" | "poll" | "off";
  pollIntervalSeconds: number;
  cacheTtlSeconds: number;
  maxBodyLength: number;
  repliesInitialCount: number;
};

const MODE_OPTIONS = [
  { value: "subscribe", label: "Subscribe (WebSocket per post)" },
  { value: "poll", label: "Poll (intervallo settable)" },
  { value: "off", label: "Off (refresh manuale)" },
] as const;

export function PostsCommentsSettingsForm({
  initial,
  capacityProfile,
}: {
  initial: PostsCommentsSettingsFormInitial;
  /** Profilo capacity del modulo. Se omesso, niente header + preset
   *  (back-compat). Letto dal manifest del modulo. */
  capacityProfile?: CapacityProfile;
}) {
  const [liveModePostPage, setLiveModePostPage] = useState(initial.liveModePostPage);
  const [liveModeFeed, setLiveModeFeed] = useState(initial.liveModeFeed);
  const [pollIntervalSeconds, setPollIntervalSeconds] = useState(initial.pollIntervalSeconds);
  const [cacheTtlSeconds, setCacheTtlSeconds] = useState(initial.cacheTtlSeconds);
  const [maxBodyLength, setMaxBodyLength] = useState(initial.maxBodyLength);
  const [repliesInitialCount, setRepliesInitialCount] = useState(initial.repliesInitialCount);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function applyPreset(preset: CapacityPreset) {
    const v = preset.values;
    const get = (k: string) => v[k];
    const lpp = get("modules.posts.comments.live_mode_post_page");
    const lf = get("modules.posts.comments.live_mode_feed");
    const pi = get("modules.posts.comments.poll_interval_seconds");
    const ct = get("modules.posts.comments.cache_ttl_seconds");
    const ri = get("modules.posts.comments.replies_initial_count");
    if (lpp && (lpp === "subscribe" || lpp === "poll" || lpp === "off")) {
      setLiveModePostPage(lpp);
    }
    if (lf && (lf === "subscribe" || lf === "poll" || lf === "off")) {
      setLiveModeFeed(lf);
    }
    if (pi) setPollIntervalSeconds(Number(pi));
    if (ct) setCacheTtlSeconds(Number(ct));
    if (ri) setRepliesInitialCount(Number(ri));
    setSaved(false);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await saveCommentsSettings({
        liveModePostPage,
        liveModeFeed,
        pollIntervalSeconds,
        cacheTtlSeconds,
        maxBodyLength,
        repliesInitialCount,
      });
      if (!res.ok) {
        setError(res.error);
      } else {
        setSaved(true);
      }
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-lg border border-[var(--admin-card-border)] bg-[var(--admin-card-bg)] p-5 space-y-4 max-w-[720px]"
    >
      <header>
        <h2 className="text-lg font-semibold text-[var(--admin-text)]">
          Comments thread
        </h2>
        <p className="text-sm text-[var(--admin-text-muted)] mt-1">
          Configurazione runtime del thread commenti. Modificare solo se
          i numeri lo richiedono — i defaults vanno bene per la scala
          attuale.
        </p>
      </header>

      {capacityProfile ? (
        <CapacityProfileHeader
          profile={capacityProfile}
          onApplyPreset={applyPreset}
        />
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SelectField
          label="Live mode — /post/[id]"
          value={liveModePostPage}
          onChange={(v) => setLiveModePostPage(v as typeof liveModePostPage)}
          options={MODE_OPTIONS}
        />

        <SelectField
          label="Live mode — feed inline"
          value={liveModeFeed}
          onChange={(v) => setLiveModeFeed(v as typeof liveModeFeed)}
          options={MODE_OPTIONS}
        />

        <NumberField
          label="Poll interval (sec, 5..120)"
          value={pollIntervalSeconds}
          onChange={setPollIntervalSeconds}
          min={5}
          max={120}
        />

        <NumberField
          label="Cache TTL (sec, 0=off, 0..300)"
          value={cacheTtlSeconds}
          onChange={setCacheTtlSeconds}
          min={0}
          max={300}
        />

        <NumberField
          label="Max body length (char, 100..2000)"
          value={maxBodyLength}
          onChange={setMaxBodyLength}
          min={100}
          max={2000}
        />

        <NumberField
          label="Reply prefetch per root (0..10)"
          value={repliesInitialCount}
          onChange={setRepliesInitialCount}
          min={0}
          max={10}
        />
      </div>

      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p className="text-sm text-green-600" role="status">
          Salvato.
        </p>
      ) : null}

      <div className="flex justify-end pt-2">
        <AdminButton type="submit" variant="primary" loading={isPending}>
          Salva
        </AdminButton>
      </div>
    </form>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
}) {
  return (
    <label className="block">
      <span className="text-xs text-[var(--admin-text-muted)] block mb-1">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-[var(--admin-input-bg)] border border-[var(--admin-card-border)] rounded-md px-3 py-2 text-sm text-[var(--admin-text)] outline-none focus:border-[var(--admin-accent)]"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
}) {
  return (
    <label className="block">
      <span className="text-xs text-[var(--admin-text-muted)] block mb-1">
        {label}
      </span>
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
