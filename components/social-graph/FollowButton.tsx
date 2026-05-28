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
    return (
      <div className="inline-flex flex-col items-end">
        <button
          type="button"
          onClick={onClick}
          aria-label={ariaLabel}
          aria-pressed={following}
          disabled={isPending}
          className={
            following
              ? "inline-flex items-center justify-center w-8 h-8 rounded-full border border-gc-line text-gc-fg-2 hover:bg-gc-bg-3 disabled:opacity-50 transition"
              : "inline-flex items-center justify-center w-8 h-8 rounded-full bg-gc-accent text-white hover:brightness-95 disabled:opacity-50 transition"
          }
        >
          {following ? <Check size={14} aria-hidden /> : <Plus size={14} aria-hidden />}
        </button>
        {error ? (
          <span className="text-[10px] text-gc-danger mt-1" role="alert">
            {error}
          </span>
        ) : null}
      </div>
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
