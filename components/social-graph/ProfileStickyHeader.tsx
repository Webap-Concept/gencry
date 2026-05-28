"use client";
// components/social-graph/ProfileStickyHeader.tsx
//
// Sticky bar compatta del profilo /u/<username>. Stesso pattern di
// CoinSummaryCard (commit 81724a74) per evitare flicker:
//
//   1) Sentinel 1px in-flow, osservato da `useIsStuck`.
//   2) Outer `position: sticky h-0` (zero reflow al flip stuck/non).
//   3) Bar absolute dentro, montata SOLO quando isStuck=true (smonto
//      invece di nascondere via opacity → niente overlay ghost sopra
//      i contenuti sotto).
//
// Sync follow state: il FollowButton dentro lo sticky condivide il
// FollowOverridesProvider globale col bottone della card grande →
// click su uno aggiorna l'altro senza prop drilling. Counter follower
// locale: si aggiorna solo quando il click avviene QUI (drift accettato
// vs card grande, che resta col valore SSR finché l'utente è scrollato
// in fondo: i due elementi non sono mai visibili insieme).

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useIsStuck } from "@/lib/hooks/use-is-stuck";
import { FollowButton } from "./FollowButton";
import { useFollowOverride } from "./FollowOverridesProvider";

export type ProfileStickyHeaderProps = {
  targetUserId: string;
  avatarUrl: string | null;
  displayName: string;
  username: string;
  initial: string;
  initialFollowersCount: number;
  viewerUserId: string | null;
  isOwnProfile: boolean;
  initialFollowing: boolean;
};

export function ProfileStickyHeader({
  targetUserId,
  avatarUrl,
  displayName,
  username,
  initial,
  initialFollowersCount,
  viewerUserId,
  isOwnProfile,
  initialFollowing,
}: ProfileStickyHeaderProps) {
  const { sentinelRef, isStuck } = useIsStuck<HTMLDivElement>();
  const t = useTranslations("core.pages.profile.stats");
  const [followersCount, setFollowersCount] = useState(initialFollowersCount);
  // Sorgente di verita' del follow state: il Provider globale, NON la
  // prop SSR. Cosi' se l'utente ha cliccato segui altrove (card grande
  // del profilo, PostCard del feed) e poi scrolla → lo sticky mostra
  // gia' lo stato corretto al mount. La `key` dinamica sotto forza il
  // remount del FollowButton ogni volta che l'override cambia, cosi' il
  // suo `useState(initialFollowing)` interno riparte dal valore latest.
  const effectiveFollowing = useFollowOverride(targetUserId, initialFollowing);

  const showFollow = !!viewerUserId && !isOwnProfile;

  return (
    <>
      <div ref={sentinelRef} aria-hidden style={{ height: 1 }} />

      {isStuck && (
        <div className="sticky top-0 z-10 -mx-4 sm:-mx-6 lg:-mx-8 h-0">
          <div
            role="region"
            aria-label={`@${username}`}
            className="absolute inset-x-0 top-0 flex items-center gap-3 px-4 sm:px-6 lg:px-8 py-2 border-b border-gc-line bg-gc-bg-2/90 animate-in fade-in-0 slide-in-from-top-1 duration-150"
            style={{
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
            }}
          >
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt=""
                aria-hidden
                className="w-7 h-7 rounded-full object-cover border border-gc-line shrink-0"
              />
            ) : (
              <div
                aria-hidden
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-serif text-white bg-gc-accent shrink-0"
              >
                {initial}
              </div>
            )}
            <div className="flex-1 min-w-0 leading-tight">
              <div className="text-sm font-semibold text-gc-fg truncate">
                {displayName}
              </div>
              <div className="text-[11px] text-gc-fg-3 truncate">
                @{username}
                <span aria-hidden> · </span>
                <span className="tabular-nums">
                  {followersCount.toLocaleString()}
                </span>{" "}
                {t("follower")}
              </div>
            </div>
            {showFollow && (
              <div className="shrink-0">
                <FollowButton
                  key={String(effectiveFollowing)}
                  targetUserId={targetUserId}
                  initialFollowing={effectiveFollowing}
                  variant="default"
                  onChange={(state) =>
                    setFollowersCount(state.followersCount)
                  }
                />
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
