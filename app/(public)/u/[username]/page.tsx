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
import { Globe } from "lucide-react";

import { displayNameForAuthor } from "@/lib/ui/author-display";
import { BusinessBadge } from "@/components/ui/business-badge";

import { PublicAdaptiveShell } from "@/components/layout/PublicAdaptiveShell";
import { PostCard } from "@/components/modules/posts/PostCard";
import { FollowButton } from "@/components/social-graph/FollowButton";
import { ProfileFollowersCard } from "@/components/social-graph/ProfileFollowersCard";
import { ProfileStickyHeader } from "@/components/social-graph/ProfileStickyHeader";
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

  const [session, stats, topCoins, t, tComp, counters] = await Promise.all([
    getSession(),
    getProfileStats(profile.userId),
    getTopCitedCoins(profile.userId, 5),
    getTranslations("core.pages.profile"),
    getTranslations("posts.profile"),
    getSocialCounters(profile.userId),
  ]);
  const viewerUserId = session?.user.id;

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

  // Layout 2026-05-28b: la profile page e' single-column nel main; le
  // card per-profilo ("Coin piu' citate" + preview Follower) vivono
  // nella VERA right rail dello shell via prop rightRailExtra. Niente
  // grid 2-col interno: il main si riduce a header full-width + feed.
  const rightRailExtra = (
    <>
      {topCoins.length > 0 && <TopCoinsCard coins={topCoins} t={t} />}
      <ProfileFollowersCard
        userId={profile.userId}
        username={profile.username}
        totalCount={counters.followersCount}
      />
    </>
  );

  const display = displayName(profile);
  const initial = (profile.firstName ?? profile.username)
    .charAt(0)
    .toUpperCase();

  return (
    <PublicAdaptiveShell rightRailExtra={rightRailExtra}>
      <div className="space-y-6 max-w-3xl">
        <ProfileHeader
          profile={profile}
          stats={stats}
          counters={counters}
          viewerUserId={viewerUserId ?? null}
          isOwnProfile={isOwnProfile}
          viewerIsFollowing={viewerFollowing}
        />
        <ProfileStickyHeader
          targetUserId={profile.userId}
          avatarUrl={profile.avatarUrl}
          displayName={display}
          username={profile.username}
          initial={initial}
          initialFollowersCount={counters.followersCount}
          viewerUserId={viewerUserId ?? null}
          isOwnProfile={isOwnProfile}
          initialFollowing={viewerFollowing}
        />
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
    </PublicAdaptiveShell>
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
  const showFollow = !!viewerUserId && !isOwnProfile;
  return (
    // Mobile: card centrata (avatar grande, nome/headline/stat centrati,
    // Follow full-width sotto). Desktop (sm+): layout orizzontale classico
    // (avatar a sx, info al centro, Follow a dx). Stesso markup, classi
    // responsive — vedi project_responsive_strategy.
    <header className="p-5 sm:p-4">
      <div className="flex flex-col items-center text-center sm:flex-row sm:items-start sm:text-left gap-4 sm:gap-3">
        <Avatar
          avatarUrl={profile.avatarUrl}
          initial={initial}
          display={display}
          verified={profile.isVerifiedBusiness}
        />
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl sm:text-xl font-serif text-gc-fg leading-tight">
            {display}
          </h1>
          <p className="profile-username text-sm text-gc-fg-3 mt-0.5">
            @{profile.username}
          </p>
          {profile.headline && (
            <p className="text-sm text-gc-fg-2 mt-1.5">{profile.headline}</p>
          )}
          {profile.bio && (
            <p className="text-sm text-gc-fg-2 mt-2 whitespace-pre-wrap leading-relaxed">
              {profile.bio}
            </p>
          )}
          {profile.isVerifiedBusiness &&
            (profile.companyWebsite || profile.companySector) && (
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-4 gap-y-1 mt-2 text-sm">
                {profile.companyWebsite && (
                  <a
                    href={profile.companyWebsite}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-gc-accent hover:underline"
                  >
                    <Globe size={14} aria-hidden />
                    {profile.companyWebsite
                      .replace(/^https?:\/\//, "")
                      .replace(/\/$/, "")}
                  </a>
                )}
                {profile.companySector && (
                  <span className="text-gc-fg-3">
                    <SectorLabel sector={profile.companySector} />
                  </span>
                )}
              </div>
            )}
        </div>
        {/* Follow desktop: inline a destra. Su mobile è nascosto e
            sostituito dalla versione full-width sotto le stat (i due
            FollowButton sono sincronizzati dal FollowOverridesProvider). */}
        {showFollow ? (
          <div className="hidden sm:block shrink-0">
            <FollowButton
              targetUserId={profile.userId}
              initialFollowing={viewerIsFollowing}
              variant="default"
            />
          </div>
        ) : null}
      </div>

      {/* Stat: mobile 3 voci centrate con divisori verticali; desktop
          griglia 4-col (con "Iscritto a"). Joined nascosto su mobile. */}
      <div className="mt-4 sm:mt-3 flex justify-center divide-x divide-gc-line border-t border-gc-line pt-4 sm:pt-3 sm:grid sm:grid-cols-4 sm:gap-3 sm:divide-x-0">
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

      {/* Follow mobile: full-width sotto le stat. Hidden su sm+. */}
      {showFollow ? (
        <div className="sm:hidden mt-4 w-full [&>div]:w-full [&_button]:w-full [&_button]:justify-center">
          <FollowButton
            targetUserId={profile.userId}
            initialFollowing={viewerIsFollowing}
            variant="default"
          />
        </div>
      ) : null}
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
      className="group block text-center rounded-lg hover:bg-gc-bg-3 px-5 py-1 sm:-mx-2 sm:px-2 transition"
    >
      <p className="profile-stat-num text-xl font-serif text-gc-fg tabular-nums leading-tight">
        {value.toLocaleString()}
      </p>
      <p className="text-[11px] uppercase tracking-wide text-gc-fg-3 group-hover:text-gc-fg-2">
        <StatLabel labelKey={labelKey} />
      </p>
    </Link>
  );
}

function Avatar({
  avatarUrl,
  initial,
  display,
  verified = false,
}: {
  avatarUrl: string | null;
  initial: string;
  display: string;
  verified?: boolean;
}) {
  const inner = avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={avatarUrl}
      alt={display}
      className="w-full h-full rounded-full object-cover border border-gc-line"
    />
  ) : (
    <div
      className="w-full h-full rounded-full flex items-center justify-center text-4xl sm:text-2xl font-serif text-white bg-gc-accent"
      aria-label={display}
    >
      {initial}
    </div>
  );

  return (
    <div className="relative w-24 h-24 sm:w-16 sm:h-16 shrink-0">
      {inner}
      {verified && (
        <span
          className="absolute bottom-0 right-0"
          style={{ transform: "translate(10%, 10%)" }}
        >
          <BusinessBadge size={28} />
        </span>
      )}
    </div>
  );
}

function Stat({ value, labelKey }: { value: number; labelKey: string }) {
  return (
    <div className="text-center px-5 py-1 sm:px-0 sm:py-0">
      <p className="profile-stat-num text-xl font-serif text-gc-fg tabular-nums leading-tight">
        {value.toLocaleString()}
      </p>
      <p className="text-[11px] uppercase tracking-wide text-gc-fg-3">
        <StatLabel labelKey={labelKey} />
      </p>
    </div>
  );
}

function StatPlaceholder({ labelKey }: { labelKey: string }) {
  return (
    <div>
      <p className="text-xl font-serif text-gc-fg-3 tabular-nums leading-tight">—</p>
      <p className="text-[11px] uppercase tracking-wide text-gc-fg-3">
        <StatLabel labelKey={labelKey} />
      </p>
    </div>
  );
}

async function StatLabel({ labelKey }: { labelKey: string }) {
  const t = await getTranslations("core.pages.profile.stats");
  return <>{t(labelKey)}</>;
}

async function SectorLabel({ sector }: { sector: string }) {
  const t = await getTranslations("core.settings.business.sectors");
  // `sector` è già validato (enum BUSINESS_SECTORS); fallback al raw se mai
  // arrivasse un valore fuori catalogo.
  try {
    return <>{t(sector as never)}</>;
  } catch {
    return <>{sector}</>;
  }
}

function JoinedStat({ createdAt }: { createdAt: Date }) {
  const formatted = createdAt.toLocaleDateString("it-IT", {
    month: "long",
    year: "numeric",
  });
  return (
    // Nascosto su mobile: la card centrata mostra solo 3 stat (follower /
    // segue / post) come da schema. "Iscritto a" resta solo su desktop.
    <div className="hidden sm:block text-center">
      <p className="text-base font-serif text-gc-fg tabular-nums leading-tight">
        {formatted}
      </p>
      <p className="text-[11px] uppercase tracking-wide text-gc-fg-3">
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
  accountType?: "personal" | "business";
  companyName?: string | null;
}): string {
  // companyName per le aziende, altrimenti nome+cognome, poi username.
  return displayNameForAuthor(profile, profile.username);
}
