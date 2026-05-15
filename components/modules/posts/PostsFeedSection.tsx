// components/modules/posts/PostsFeedSection.tsx
//
// RSC della Home loggata. Decisione UX 2026-05-14: la Home mostra
// SOLO il feed personalizzato (chi seguo). Discoverability di
// contenuti pubblici si fa in /explore (pagina separata, futuro).
// Niente più "Discover/Following" tabs nella home.
//
// Fino al modulo `follows` l'array seguiti è vuoto → la home mostra
// un empty-state con CTA verso /explore. Comportamento standard di
// tutti i social per nuovi utenti (Twitter, IG, Bluesky).
import "server-only";
import { getUser } from "@/lib/db/queries";
import { getFeedIds, getPostsByIds } from "@/lib/modules/posts/queries";
import { getCoinNameMap } from "@/lib/modules/prices/queries";
import { FeedList } from "./FeedList";

export async function PostsFeedSection() {
  const user = await getUser();
  if (!user) {
    throw new Error("PostsFeedSection rendered without authenticated user");
  }

  // Home = Following only. `getFeedIds({ tab: 'following' })` oggi
  // ritorna sempre [] (stub fino al modulo follows). Il backend Discover
  // resta vivo e sarà usato da /explore.
  const [page, coinNameMap] = await Promise.all([
    getFeedIds({ tab: "following", viewerUserId: user.id }),
    getCoinNameMap(),
  ]);
  const initialPosts = await getPostsByIds(page.ids, { viewerUserId: user.id });

  return (
    <FeedList
      initialPosts={initialPosts}
      initialNextCursor={page.nextCursor}
      viewerUserId={user.id}
      source={{ kind: "tab", tab: "following" }}
      coinNameMap={coinNameMap}
    />
  );
}

export function PostsFeedSectionSkeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="bg-gc-bg-2 border border-gc-line rounded-gc p-5 h-32 animate-pulse"
        />
      ))}
    </div>
  );
}
