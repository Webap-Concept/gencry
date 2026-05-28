// components/social-graph/FollowListPage.tsx
//
// RSC + componente client per la lista paginata di follower / following.
// SSR la prima pagina, "Load more" via Server Action `loadMoreFollowList`.
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import type { FollowListItem } from "@/lib/modules/social-graph/queries";
import { FollowListClient } from "./FollowListClient";

export type FollowListDirection = "followers" | "following";

type Profile = {
  userId: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
};

function displayName(p: Profile): string {
  const fn = p.firstName?.trim();
  const ln = p.lastName?.trim();
  if (fn && ln) return `${fn} ${ln}`;
  if (fn) return fn;
  if (ln) return ln;
  return p.username;
}

export async function FollowListPage({
  direction,
  profile,
  initialItems,
  initialNextCursor,
}: {
  direction: FollowListDirection;
  profile: Profile;
  initialItems: FollowListItem[];
  initialNextCursor: string | null;
}) {
  const tStats = await getTranslations("socialGraph.stats");
  const tEmpty = await getTranslations("socialGraph.empty");
  const profileHref = `/u/${profile.username.toLowerCase()}`;
  const display = displayName(profile);

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <header className="bg-gc-bg-2 border border-gc-line rounded-2xl p-5">
        <Link
          href={profileHref}
          prefetch={false}
          className="text-sm text-gc-fg-3 hover:underline"
        >
          ← {display}
        </Link>
        <h1 className="text-2xl font-serif text-gc-fg mt-1">
          {direction === "followers"
            ? tStats("followers_label")
            : tStats("following_label")}
        </h1>
      </header>

      <FollowListClient
        direction={direction}
        userId={profile.userId}
        initialItems={initialItems}
        initialNextCursor={initialNextCursor}
        emptyTitle={
          direction === "followers"
            ? tEmpty("followers_title")
            : tEmpty("following_title")
        }
        emptyDescription={
          direction === "followers"
            ? tEmpty("followers_description", { name: display })
            : tEmpty("following_description", { name: display })
        }
      />
    </div>
  );
}
