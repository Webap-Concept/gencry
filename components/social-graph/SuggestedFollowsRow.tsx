// components/social-graph/SuggestedFollowsRow.tsx
//
// Carousel "Suggested to follow" mostrato sopra il feed Home in stato
// empty (viewer non segue ancora nessuno). Algoritmo V1: top utenti per
// followers_count, escludendo il viewer stesso e gli utenti che gia'
// segue. Massimo 8 card.
//
// V2 candidato: ranking algoritmico (engagement signal, recency). Per
// ora pure popularity-based.
import "server-only";
import { Suspense } from "react";
import Link from "next/link";
import { sql } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db/drizzle";
import { UserAvatar } from "@/components/ui/user-avatar";
import { FollowButton } from "./FollowButton";

const SUGGESTED_LIMIT = 8;

type SuggestedUser = {
  userId: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  headline: string | null;
  isVerifiedBusiness: boolean;
  followersCount: number;
};

type SuggestedRow = {
  user_id: string;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  headline: string | null;
  account_type: string | null;
  company_verified_at: Date | string | null;
  followers_count: number;
};

async function loadSuggested(viewerUserId: string): Promise<SuggestedUser[]> {
  // Build-time short-circuit
  if (process.env.NEXT_PHASE === "phase-production-build") return [];

  const rows = await db.execute<SuggestedRow>(sql`
    SELECT
      c.user_id,
      p.username,
      p.first_name,
      p.last_name,
      p.avatar_url,
      p.headline,
      p.account_type,
      p.company_verified_at,
      c.followers_count
    FROM user_social_counters c
    LEFT JOIN user_profiles p ON p.user_id = c.user_id
    WHERE c.user_id <> ${viewerUserId}
      AND c.followers_count > 0
      AND NOT EXISTS (
        SELECT 1 FROM user_follows uf
        WHERE uf.follower_id = ${viewerUserId} AND uf.followed_id = c.user_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM posts_user_blocks b
        WHERE (b.blocker_id = ${viewerUserId} AND b.blocked_id = c.user_id)
           OR (b.blocked_id = ${viewerUserId} AND b.blocker_id = c.user_id)
      )
    ORDER BY c.followers_count DESC
    LIMIT ${SUGGESTED_LIMIT}
  `);

  const list = Array.isArray(rows)
    ? (rows as SuggestedRow[])
    : ((rows as { rows?: SuggestedRow[] }).rows ?? []);

  return (list as SuggestedRow[]).map((r) => ({
    userId: r.user_id,
    username: r.username,
    firstName: r.first_name,
    lastName: r.last_name,
    avatarUrl: r.avatar_url,
    headline: r.headline,
    isVerifiedBusiness:
      r.account_type === "business" && r.company_verified_at !== null,
    followersCount: Number(r.followers_count) || 0,
  }));
}

export function SuggestedFollowsRow({
  viewerUserId,
}: {
  viewerUserId: string;
}) {
  return (
    <Suspense fallback={null}>
      <SuggestedFollowsRowInner viewerUserId={viewerUserId} />
    </Suspense>
  );
}

async function SuggestedFollowsRowInner({
  viewerUserId,
}: {
  viewerUserId: string;
}) {
  const [users, t] = await Promise.all([
    loadSuggested(viewerUserId),
    getTranslations("socialGraph.suggested"),
  ]);

  if (users.length === 0) return null;

  return (
    <section
      className="bg-gc-bg-2 border border-gc-line rounded-xl p-5"
      aria-labelledby="suggested-follows-heading"
    >
      <header className="mb-4">
        <h2
          id="suggested-follows-heading"
          className="text-base font-semibold text-gc-fg"
        >
          {t("title")}
        </h2>
        <p className="text-xs text-gc-fg-muted mt-0.5">{t("subtitle")}</p>
      </header>
      <ul className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x snap-mandatory">
        {users.map((u) => (
          <li
            key={u.userId}
            className="shrink-0 w-44 snap-start bg-gc-bg-3 border border-gc-line rounded-lg p-3 flex flex-col items-center text-center gap-2"
          >
            <Link
              href={u.username ? `/u/${u.username.toLowerCase()}` : "#"}
              prefetch={false}
              className="flex flex-col items-center gap-1"
            >
              <SuggestedAvatar user={u} />
              <span className="text-sm font-medium text-gc-fg truncate max-w-[10rem]">
                {displayName(u)}
              </span>
              {u.username ? (
                <span className="text-xs text-gc-fg-3">@{u.username}</span>
              ) : null}
            </Link>
            {u.headline ? (
              <p className="text-[11px] text-gc-fg-muted line-clamp-2">
                {u.headline}
              </p>
            ) : null}
            <FollowButton
              targetUserId={u.userId}
              initialFollowing={false}
              variant="default"
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function SuggestedAvatar({ user }: { user: SuggestedUser }) {
  return (
    <UserAvatar
      user={{
        id: user.userId,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        avatarUrl: user.avatarUrl,
      }}
      size={56}
      verifiedBusiness={user.isVerifiedBusiness}
    />
  );
}

function displayName(u: SuggestedUser): string {
  const fn = u.firstName?.trim();
  const ln = u.lastName?.trim();
  if (fn && ln) return `${fn} ${ln}`;
  if (fn) return fn;
  if (ln) return ln;
  return u.username ?? "—";
}
