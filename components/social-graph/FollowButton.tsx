"use client";
// components/social-graph/FollowButton.tsx
//
// Bottone Follow/Following client-side con optimistic UI.
// - useTransition per loader senza bloccare la UI
// - Optimistic toggle istantaneo, rollback se l'action fallisce
// - Hidden per viewer == target (parent decide; questo componente
//   non disegna il check)
//
// L'errore i18n viene risolto dal namespace `socialGraph.errors.*`.
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Check, Plus } from "lucide-react";
import {
  followUserAction,
  unfollowUserAction,
} from "@/lib/modules/social-graph/actions";
import type { FollowErrorCode } from "@/lib/modules/social-graph/types";
import { useSetFollowOverride } from "./FollowOverridesProvider";

export type FollowButtonProps = {
  targetUserId: string;
  initialFollowing: boolean;
  /** "default" = pill verde con label; "compact" = solo icona (per PostCard
   *  header dove lo spazio è poco). */
  variant?: "default" | "compact";
  /** Optional callback per re-sync counter parent (es. profile page
   *  header dopo follow). Riceve l'ultimo snapshot dei counter. */
  onChange?: (state: {
    following: boolean;
    followersCount: number;
    followingCount: number;
  }) => void;
};

export function FollowButton({
  targetUserId,
  initialFollowing,
  variant = "default",
  onChange,
}: FollowButtonProps) {
  const t = useTranslations("socialGraph.button");
  const tErr = useTranslations("socialGraph.errors");
  const setOverride = useSetFollowOverride();
  const [following, setFollowing] = useState(initialFollowing);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onClick = () => {
    if (isPending) return;
    const previous = following;
    // Optimistic toggle
    setFollowing(!previous);
    setError(null);
    startTransition(async () => {
      const action = previous ? unfollowUserAction : followUserAction;
      const res = await action(targetUserId);
      if (!res.ok) {
        // Rollback
        setFollowing(previous);
        const code: FollowErrorCode = res.error;
        const message =
          code === "rate_limited"
            ? tErr("rate_limited", { seconds: res.retryAfter ?? 60 })
            : tErr(code);
        setError(message);
        return;
      }
      // Pubblica l'override nel Context globale → tutti i PostCard
      // (e altri consumer) dello stesso authorId si re-renderizzano
      // coerenti senza prop drilling. No-op fuori dal Provider.
      setOverride(targetUserId, res.following);
      onChange?.({
        following: res.following,
        followersCount: res.followersCount,
        followingCount: res.followingCount,
      });
    });
  };

  const label = following ? t("following") : t("follow");
  const ariaLabel = following ? t("unfollow") : t("follow");

  if (variant === "compact") {
    // Compact CTA visibile in ogni PostCard. Design:
    //   - stato base: pallino 24px, bordo gc-line, niente background
    //     (non distrae nel feed); icona + neutra.
    //   - hover: la pillola si estende a DESTRA (l'icona resta ancorata
    //     alla sua posizione X: padding-left fisso + justify-start →
    //     nessuno shift orizzontale del `+` durante l'animazione, solo
    //     rotazione di 90° in place). Si colora con bg-gc-accent + testo
    //     bianco. Compare il label "Segui".
    //   - padding `px-1.5` simmetrico: 6px sx (centra il + nel pallino
    //     base con icon 12px → 6+12+6=24) e 6px dx (gap visivo dopo il
    //     label in stato espanso).
    return (
      <span className="inline-flex flex-col items-end">
        <button
          type="button"
          onClick={onClick}
          aria-label={ariaLabel}
          aria-pressed={following}
          disabled={isPending}
          className="group/follow inline-flex items-center justify-start h-6 px-1.5 rounded-full border border-gc-line bg-transparent text-gc-fg-2 overflow-hidden hover:bg-gc-accent hover:text-white hover:border-transparent disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gc-accent transition-[background-color,color,border-color] duration-200 ease-out"
        >
          <Plus
            size={12}
            strokeWidth={2.75}
            aria-hidden
            className="shrink-0 transition-transform duration-200 ease-out group-hover/follow:rotate-90"
          />
          {/* Label nascosto in stato base (max-w-0 + opacity-0 + ml-0):
              non occupa spazio orizzontale, quindi il `+` resta centrato
              nel pallino 24px. In hover si espande con ml-1.5 (gap) +
              opacity 1 + width libera fino a 80px. */}
          <span className="overflow-hidden whitespace-nowrap text-[11px] font-medium leading-none max-w-0 opacity-0 ml-0 group-hover/follow:max-w-[80px] group-hover/follow:opacity-100 group-hover/follow:ml-1.5 transition-[max-width,opacity,margin-left] duration-200 ease-out">
            {t("follow")}
          </span>
        </button>
        {error ? (
          <span className="text-[10px] text-gc-danger mt-1" role="alert">
            {error}
          </span>
        ) : null}
      </span>
    );
  }

  return (
    <div className="inline-flex flex-col items-end">
      <button
        type="button"
        onClick={onClick}
        aria-pressed={following}
        disabled={isPending}
        className={
          following
            ? "inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full border border-gc-line text-sm text-gc-fg-2 hover:bg-gc-bg-3 disabled:opacity-50 transition"
            : "inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-gc-accent text-white text-sm font-medium hover:brightness-95 disabled:opacity-50 transition"
        }
      >
        {following ? (
          <Check size={14} strokeWidth={2.5} aria-hidden />
        ) : (
          <Plus size={14} strokeWidth={2.5} aria-hidden />
        )}
        <span>{label}</span>
      </button>
      {error ? (
        <span className="text-[11px] text-gc-danger mt-1" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
