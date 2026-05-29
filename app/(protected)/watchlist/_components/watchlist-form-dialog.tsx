"use client";
// Form dialog "Nuova watchlist" / "Modifica watchlist". Modalita'
// controllata dal parent via `open` / `onOpenChange`. Riusa GcModal
// (memoria feedback_gc_modal_primitive).
//
// Per `mode="edit"` accetta `initialValues` (id obbligatorio). Per
// `mode="create"` initialValues e' opzionale (puo' precompilare un
// suggested name in futuro).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Bookmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  GcModal,
  GcModalContent,
  GcModalClose,
} from "@/components/ui/gc-modal";
import {
  createWatchlistAction,
  setFeaturedWatchlistAction,
  updateWatchlistAction,
} from "@/lib/modules/watchlist/actions";
import {
  NAME_MAX,
  DESCRIPTION_MAX,
  type WatchlistVisibility,
} from "@/lib/modules/watchlist/types";

type Mode = "create" | "edit";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: Mode;
  initialValues?: {
    id?: string;
    name?: string;
    description?: string | null;
    visibility?: WatchlistVisibility;
    featuredInFeed?: boolean;
  };
};

export function WatchlistFormDialog({
  open,
  onOpenChange,
  mode,
  initialValues,
}: Props) {
  const t = useTranslations("watchlist.form");
  const tErr = useTranslations("watchlist.errors");
  const router = useRouter();
  const [name, setName] = useState(initialValues?.name ?? "");
  const [description, setDescription] = useState(
    initialValues?.description ?? "",
  );
  const [visibility, setVisibility] = useState<WatchlistVisibility>(
    initialValues?.visibility ?? "private",
  );
  const [featured, setFeatured] = useState(
    initialValues?.featuredInFeed ?? false,
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    startTransition(async () => {
      if (mode === "create") {
        const res = await createWatchlistAction({
          name: name.trim(),
          description: description.trim() || undefined,
          visibility,
        });
        if (!res.ok) {
          setError(formatError(res, tErr));
          return;
        }
        onOpenChange(false);
        router.refresh();
        return;
      }
      // edit
      if (!initialValues?.id) return;
      const res = await updateWatchlistAction({
        id: initialValues.id,
        name: name.trim(),
        description: description.trim() || undefined,
      });
      if (!res.ok) {
        setError(formatError(res, tErr));
        return;
      }
      // Flag "appare nel feed": action separata, chiamata solo se cambiato.
      if (featured !== (initialValues.featuredInFeed ?? false)) {
        const fres = await setFeaturedWatchlistAction({
          id: initialValues.id,
          featured,
        });
        if (!fres.ok) {
          setError(formatError(fres, tErr));
          return;
        }
      }
      onOpenChange(false);
      router.refresh();
    });
  };

  return (
    <GcModal open={open} onOpenChange={onOpenChange}>
      <GcModalContent
        icon={Bookmark}
        title={mode === "create" ? t("submit_create") : t("submit_save")}
        size="md"
        footer={
          <>
            <GcModalClose asChild>
              <Button type="button" variant="ghost" size="sm" disabled={isPending}>
                {t("cancel")}
              </Button>
            </GcModalClose>
            <Button
              type="button"
              size="sm"
              onClick={submit}
              disabled={isPending || name.trim().length === 0}
            >
              {mode === "create" ? t("submit_create") : t("submit_save")}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="wl-name" className="block text-xs uppercase tracking-wide text-gc-fg-3 mb-1.5">
              {t("name_label")}
            </label>
            <input
              id="wl-name"
              type="text"
              maxLength={NAME_MAX}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("name_placeholder")}
              className="w-full px-3 py-2 rounded-lg border border-gc-line bg-gc-bg text-sm text-gc-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-gc-accent"
              disabled={isPending}
              autoFocus
            />
          </div>
          <div>
            <label htmlFor="wl-desc" className="block text-xs uppercase tracking-wide text-gc-fg-3 mb-1.5">
              {t("description_label")}
            </label>
            <textarea
              id="wl-desc"
              rows={3}
              maxLength={DESCRIPTION_MAX}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("description_placeholder")}
              className="w-full px-3 py-2 rounded-lg border border-gc-line bg-gc-bg text-sm text-gc-fg resize-none focus:outline-none focus-visible:ring-2 focus-visible:ring-gc-accent"
              disabled={isPending}
            />
          </div>
          {mode === "create" ? (
            <fieldset>
              <legend className="block text-xs uppercase tracking-wide text-gc-fg-3 mb-1.5">
                {t("visibility_label")}
              </legend>
              <div className="flex flex-col gap-2">
                <VisibilityRadio
                  value="private"
                  checked={visibility === "private"}
                  onChange={() => setVisibility("private")}
                  label={t("visibility_private_label")}
                  disabled={isPending}
                />
                <VisibilityRadio
                  value="public"
                  checked={visibility === "public"}
                  onChange={() => setVisibility("public")}
                  label={t("visibility_public_label")}
                  disabled={isPending}
                />
              </div>
            </fieldset>
          ) : null}
          {mode === "edit" ? (
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={featured}
                onChange={(e) => setFeatured(e.target.checked)}
                disabled={isPending}
                className="mt-0.5 accent-gc-accent"
              />
              <span>
                <span className="block text-sm text-gc-fg-2">
                  {t("featured_label")}
                </span>
                <span className="block text-xs text-gc-fg-3 mt-0.5">
                  {t("featured_hint")}
                </span>
              </span>
            </label>
          ) : null}
          {error ? (
            <p className="text-xs text-gc-danger" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </GcModalContent>
    </GcModal>
  );
}

function VisibilityRadio({
  value,
  checked,
  onChange,
  label,
  disabled,
}: {
  value: WatchlistVisibility;
  checked: boolean;
  onChange: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-gc-fg-2 cursor-pointer">
      <input
        type="radio"
        name="wl-visibility"
        value={value}
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="accent-gc-accent"
      />
      {label}
    </label>
  );
}

function formatError(
  res: { error: string; cap?: number; retryAfter?: number },
  tErr: ReturnType<typeof useTranslations<"watchlist.errors">>,
): string {
  const code = res.error;
  if (code === "cap_reached") {
    return tErr("watchlist_cap_reached", { cap: res.cap ?? 5 });
  }
  if (code === "coins_cap_reached") {
    return tErr("watchlist_coins_cap_reached", { cap: res.cap ?? 50 });
  }
  if (code === "rate_limited") {
    return tErr("rate_limited", { seconds: res.retryAfter ?? 60 });
  }
  // Tutti gli altri error code hanno una key 1:1 in watchlist.errors.
  try {
    return tErr(
      code as
        | "slug_taken"
        | "name_required"
        | "name_too_long"
        | "not_found"
        | "forbidden"
        | "validation"
        | "generic",
    );
  } catch {
    return tErr("generic");
  }
}
