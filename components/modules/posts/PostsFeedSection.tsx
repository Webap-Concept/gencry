// components/modules/posts/PostsFeedSection.tsx
//
// RSC della Home loggata. Feed UNICO (no tab) following-first + discovery
// fill. Decisione UX 2026-05-28: una sola lista, niente "Per te / Seguiti".
//
// Strategia:
//   - Se l'utente segue qualcuno → mostra prima i loro post, poi quando
//     finiti riempie con discovery per evitare buchi.
//   - Se non segue ancora nessuno → mostra un banner "build your feed"
//     sopra + carousel "Suggested to follow" + feed discovery sotto.
//   - In tutti i casi il feed NON e' mai vuoto: getHomeFeedIds cade su
//     getDiscoverFeedIds quando followingSet e' vuoto.
import "server-only";
import { getUser } from "@/lib/db/queries";
import { getHomeFeedIds, getPostsByIds } from "@/lib/modules/posts/queries";
import { getFollowingSet } from "@/lib/modules/social-graph/queries";
import { getCoinNameMap } from "@/lib/modules/prices/queries";
import { getTickerPreviewBatch } from "@/lib/modules/posts/ticker-preview-actions";
import { collectVisibleTickers } from "@/lib/modules/posts/lib/collect-visible-tickers";
import { loadCommentsConfig } from "@/lib/modules/posts/comments-config";
import { FeedList } from "./FeedList";
import { HomeEmptyBanner } from "@/components/social-graph/HomeEmptyBanner";
import { HomeNewPostsBanner } from "@/components/social-graph/HomeNewPostsBanner";
import { SuggestedFollowsRow } from "@/components/social-graph/SuggestedFollowsRow";

export async function PostsFeedSection() {
  const user = await getUser();
  if (!user) {
    throw new Error("PostsFeedSection rendered without authenticated user");
  }

  const [page, coinNameMap, commentsConfig, followingSet] = await Promise.all([
    getHomeFeedIds({ viewerUserId: user.id }),
    getCoinNameMap(),
    loadCommentsConfig(),
    getFollowingSet(user.id),
  ]);
  const initialPosts = await getPostsByIds(page.ids, { viewerUserId: user.id });
  const tickerPreviewMap = await getTickerPreviewBatch(
    collectVisibleTickers(initialPosts),
  );

  // Map authorId -> isFollowing per il bottone Follow compact su ogni PostCard.
  const viewerFollowingMap: Record<string, boolean> = {};
  for (const p of initialPosts) {
    viewerFollowingMap[p.author.id] = followingSet.has(p.author.id);
  }

  const showEmptyState = followingSet.size === 0;
  const followingIds = Array.from(followingSet);

  return (
    <div className="space-y-4">
      {showEmptyState ? (
        <>
          <HomeEmptyBanner />
          <SuggestedFollowsRow viewerUserId={user.id} />
        </>
      ) : (
        <HomeNewPostsBanner
          viewerUserId={user.id}
          followingIds={followingIds}
        />
      )}
      <FeedList
        initialPosts={initialPosts}
        initialNextCursor={page.nextCursor}
        viewerUserId={user.id}
        source={{ kind: "home" }}
        coinNameMap={coinNameMap}
        tickerPreviewMap={tickerPreviewMap}
        viewerFollowingMap={viewerFollowingMap}
        commentsThreadProps={{
          viewerUserId: user.id,
          viewerProfile: {
            username: user.username,
            firstName: user.firstName,
            lastName: user.lastName,
            avatarUrl: user.avatarUrl,
            headline: user.headline,
          },
          liveMode: commentsConfig.liveModeFeed,
          pollIntervalSeconds: commentsConfig.pollIntervalSeconds,
          repliesInitialCount: commentsConfig.repliesInitialCount,
          maxBodyLength: commentsConfig.maxBodyLength,
        }}
      />
    </div>
  );
}

export function PostsFeedSectionSkeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="bg-gc-bg-2 border border-gc-line rounded-xl p-5 h-32 animate-pulse"
        />
      ))}
    </div>
  );
}
