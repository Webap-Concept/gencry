// app/(public)/u/[username]/page.tsx
//
// Pagina profilo pubblica /u/<username>. Visibile anche ad anon.
// Pattern adaptive layout (PublicAdaptiveShell) — ProtectedShell per i
// loggati, PublicHeader per gli anon. Vedi
// project_adaptive_public_layout.md.
//
// v1 (2026-05-21): header + stats minime + feed posts in colonna.
// Niente load-more (mostra primi N e basta), tabs altre disabled,
// niente actions bar (follow/msg/notifiche). Tutto questo è gated
// dietro l'arrivo del modulo follows.
//
// Schema `users.profile_visibility = protected` è no-op v1: la query
// del feed non filtra ancora — la logica "solo follower vede" arriverà
// con follows. La colonna esiste già per evitare migration breaking
// quando aggiungeremo la UI in /settings/privacy.

import { notFound } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";

import { PublicAdaptiveShell } from "@/components/layout/PublicAdaptiveShell";
import { PostCard } from "@/components/modules/posts/PostCard";
import { FollowButton } from "@/components/social-graph/FollowButton";
import { ProfileFollowersCard } from "@/components/social-graph/ProfileFollowersCard";
import { getSession } from "@/lib/auth/session";
import { getCoinNameMap } from "@/lib/modules/prices/queries";
import { getProfileFeedIds, getPostsByIds } from "@/lib/modules/posts/queries";
import {
  getFollowingSet,
  getSocialCounters,
} from "@/lib/modules/social-graph/queries";
import {
  getProfileByUsername,
  getProfileStats,
  getTopCitedCoins,
} from "@/lib/profile/queries";
import { generatePageMetadata } from "@/lib/seo";

const PROFILE_FEED_PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  const profile = await getProfileByUsername(username);
  if (!profile) return { title: "Profilo non trovato" };

  const display = displayName(profile);
  const pathname = `/u/${profile.username.toLowerCase()}`;
  const title = `${display} (@${profile.username})`;
  const description =
    profile.bio?.slice(0, 160) ??
    profile.headline ??
    `Profilo di @${profile.username} su Generazione Crypto.`;
  return generatePageMetadata(pathname, {
    title,
    description,
  });
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const profile = await getProfileByUsername(username);
  // 404 PRIMA dello shell: l'unwind raggiunge app/not-found.tsx senza
  // wrappare con la sidebar/right rail. Stesso pattern di /coins/[symbol].
  if (!profile) notFound();

  return (
    <PublicAdaptiveShell>
      <ProfilePageBody profile={profile} />
    </PublicAdaptiveShell>
  );
}

// ---------------------------------------------------------------------------
// Body
// ---------------------------------------------------------------------------

async function ProfilePageBody({
  profile,
}: {
  profile: Awaited<ReturnType<typeof getProfileByUsername>> & {};
}) {
  const [session, stats, topCoins, t, tComp, counters] = await Promise.all([
    getSession(),
    getProfileStats(profile.userId),
    getTopCitedCoins(profile.userId, 5),
    getTranslations("core.pages.profile"),
    getTranslations("posts.profile"),
    getSocialCounters(profile.userId),
  ]);
  const viewerUserId = session?.user.id;

  // Feed posts dell'utente: prime PROFILE_FEED_PAGE_SIZE. Niente
  // load-more in v1 (parcheggiato fino a quando aggiungiamo paginazione
  // dedicata al profilo). Riusa la query esistente con cache 60s.
  const feedPage = await getProfileFeedIds({
    authorId: profile.userId,
    viewerUserId,
    pageSize: PROFILE_FEED_PAGE_SIZE,
  });
  const [posts, coinNameMap, viewerFollowing] = await Promise.all([
    getPostsByIds(feedPage.ids, { viewerUserId }),
    getCoinNameMap(),
    viewerUserId && viewerUserId !== profile.userId
      ? (async () => (await getFollowingSet(viewerUserId)).has(profile.userId))()
      : Promise.resolve(false),
  ]);
  const isOwnProfile = viewerUserId === profile.userId;

  // Layout 2026-05-28: header full-width (le info anagrafiche sono già lì,
  // niente InfoCard ridondante a destra), aside con "Coin più citate" e
  // "Follower" preview (link "Vedi tutti" → /u/[u]/followers).
  return (
    <div className="space-y-6 max-w-5xl">
      <ProfileHeader
        profile={profile}
        stats={stats}
        counters={counters}
        viewerUserId={viewerUserId ?? null}
        isOwnProfile={isOwnProfile}
        viewerIsFollowing={viewerFollowing}
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="space-y-3">
          {posts.length === 0 ? (
            <EmptyState message={tComp("empty_state")} />
          ) : (
            <ul className="space-y-3" aria-label={tComp("posts_aria")}>
              {posts.map((post) => (
                <li key={post.id}>
                  <PostCard
                    post={post}
                    isAuthor={viewerUserId === post.author.id}
                    variant="feed"
                    coinNameMap={coinNameMap}
                    viewerIsFollowingAuthor={
                      !viewerUserId || isOwnProfile ? undefined : viewerFollowing
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
        <aside className="hidden lg:block space-y-4">
          {topCoins.length > 0 && <TopCoinsCard coins={topCoins} t={t} />}
          <ProfileFollowersCard
            userId={profile.userId}
            username={profile.username}
            totalCount={counters.followersCount}
          />
        </aside>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function ProfileHeader({
  profile,
  stats,
  counters,
  viewerUserId,
  isOwnProfile,
  viewerIsFollowing,
}: {
  profile: NonNullable<Awaited<ReturnType<typeof getProfileByUsername>>>;
  stats: Awaited<ReturnType<typeof getProfileStats>>;
  counters: { followersCount: number; followingCount: number };
  viewerUserId: string | null;
  isOwnProfile: boolean;
  viewerIsFollowing: boolean;
}) {
  const display = displayName(profile);
  const initial = (profile.firstName ?? profile.username).charAt(0).toUpperCase();
  const usernameLower = profile.username.toLowerCase();
  return (
    <header className="bg-gc-bg-2 border border-gc-line rounded-2xl p-6 sm:p-8">
      <div className="flex items-start gap-5 flex-wrap">
        <Avatar avatarUrl={profile.avatarUrl} initial={initial} display={display} />
        <div className="flex-1 min-w-0">
          <h1 className="text-3xl font-serif text-gc-fg leading-tight">
            {display}
          </h1>
          <p className="text-sm text-gc-fg-3 mt-1">@{profile.username}</p>
          {profile.headline && (
            <p className="text-sm text-gc-fg-2 mt-2">{profile.headline}</p>
          )}
          {profile.bio && (
            <p className="text-sm text-gc-fg-2 mt-3 whitespace-pre-wrap leading-relaxed">
              {profile.bio}
            </p>
          )}
        </div>
        {viewerUserId && !isOwnProfile ? (
          <div className="shrink-0">
            <FollowButton
              targetUserId={profile.userId}
              initialFollowing={viewerIsFollowing}
              variant="default"
            />
          </div>
        ) : null}
      </div>
      <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3 border-t border-gc-line pt-5">
        <CounterStatLink
          href={`/u/${usernameLower}/followers`}
          value={counters.followersCount}
          labelKey="follower"
        />
        <CounterStatLink
          href={`/u/${usernameLower}/following`}
          value={counters.followingCount}
          labelKey="following"
        />
        <Stat value={stats.postsTotal} labelKey="posts" />
        <JoinedStat createdAt={profile.createdAt} />
      </div>
    </header>
  );
}

function CounterStatLink({
  href,
  value,
  labelKey,
}: {
  href: string;
  value: number;
  labelKey: string;
}) {
  return (
    <Link
      href={href}
      prefetch={false}
      className="group block rounded-lg hover:bg-gc-bg-3 -mx-2 px-2 py-1 transition"
    >
      <p className="text-2xl font-serif text-gc-fg tabular-nums">
        {value.toLocaleString()}
      </p>
      <p className="text-[11px] uppercase tracking-wide text-gc-fg-3 mt-0.5 group-hover:text-gc-fg-2">
        <StatLabel labelKey={labelKey} />
      </p>
    </Link>
  );
}

function Avatar({
  avatarUrl,
  initial,
  display,
}: {
  avatarUrl: string | null;
  initial: string;
  display: string;
}) {
  if (avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={avatarUrl}
        alt={display}
        className="w-24 h-24 rounded-full object-cover border border-gc-line"
      />
    );
  }
  return (
    <div
      className="w-24 h-24 rounded-full flex items-center justify-center text-4xl font-serif text-white bg-gc-accent"
      aria-label={display}
    >
      {initial}
    </div>
  );
}

function Stat({ value, labelKey }: { value: number; labelKey: string }) {
  return (
    <div>
      <p className="text-2xl font-serif text-gc-fg tabular-nums">
        {value.toLocaleString()}
      </p>
      <p className="text-[11px] uppercase tracking-wide text-gc-fg-3 mt-0.5">
        <StatLabel labelKey={labelKey} />
      </p>
    </div>
  );
}

function StatPlaceholder({ labelKey }: { labelKey: string }) {
  return (
    <div>
      <p className="text-2xl font-serif text-gc-fg-3 tabular-nums">—</p>
      <p className="text-[11px] uppercase tracking-wide text-gc-fg-3 mt-0.5">
        <StatLabel labelKey={labelKey} />
      </p>
    </div>
  );
}

async function StatLabel({ labelKey }: { labelKey: string }) {
  const t = await getTranslations("core.pages.profile.stats");
  return <>{t(labelKey)}</>;
}

function JoinedStat({ createdAt }: { createdAt: Date }) {
  const formatted = createdAt.toLocaleDateString("it-IT", {
    month: "long",
    year: "numeric",
  });
  return (
    <div>
      <p className="text-lg font-serif text-gc-fg tabular-nums">{formatted}</p>
      <p className="text-[11px] uppercase tracking-wide text-gc-fg-3 mt-0.5">
        <StatLabel labelKey="joined" />
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sidebar dx
// ---------------------------------------------------------------------------


function TopCoinsCard({
  coins,
  t,
}: {
  coins: Array<{ ticker: string; count: number }>;
  t: Awaited<ReturnType<typeof getTranslations<"core.pages.profile">>>;
}) {
  return (
    <section className="bg-gc-bg-2 border border-gc-line rounded-2xl p-5">
      <h2 className="text-base font-serif italic text-gc-fg mb-3">
        {t("top_coins_title")}
      </h2>
      <ul className="flex flex-wrap gap-2">
        {coins.map((c) => (
          <li key={c.ticker}>
            <Link
              href={`/coins/${c.ticker.toLowerCase()}`}
              prefetch={false}
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-gc-bg-3 text-xs hover:bg-gc-bg-3/80 transition-colors"
            >
              <span className="font-medium text-gc-fg">${c.ticker}</span>
              <span className="text-gc-fg-3 tabular-nums">{c.count}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ message }: { message: string }) {
  return (
    <div className="bg-gc-bg-2 border border-dashed border-gc-line rounded-2xl p-8 text-center text-sm text-gc-fg-3">
      {message}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function displayName(profile: {
  firstName: string | null;
  lastName: string | null;
  username: string;
}): string {
  const fn = profile.firstName?.trim();
  const ln = profile.lastName?.trim();
  if (fn && ln) return `${fn} ${ln}`;
  if (fn) return fn;
  if (ln) return ln;
  return profile.username;
}
