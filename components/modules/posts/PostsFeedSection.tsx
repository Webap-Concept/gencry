// components/modules/posts/PostsFeedSection.tsx
//
// RSC che renderizza Composer + FeedList per la home loggata. È la
// sezione registrata nello slot `home.main` (vedi
// lib/modules/posts/home-sections.ts).
//
// Pull dei dati lato server: getUser + getFeedIds(discover) +
// getPostsByIds(...). Il client riceve `initialPosts` già hydratato e
// niente skeleton al primo paint.
import "server-only";
import { getUser } from "@/lib/db/queries";
import { getAppSettings } from "@/lib/db/settings-queries";
import { getFeedIds, getPostsByIds } from "@/lib/modules/posts/queries";
import { Composer } from "./Composer";
import { FeedList } from "./FeedList";

export async function PostsFeedSection() {
  const user = await getUser();
  // Defense-in-depth: il gate dell'HomeSection (isEnabled) già filtra
  // gli anonimi PRIMA di renderizzare questa sezione. Se per qualunque
  // ragione arriviamo qui senza user, throw — il resolver del registry
  // lo cattura e tratta la sezione come disabilitata invece di crashare
  // tutta la home.
  if (!user) {
    throw new Error("PostsFeedSection rendered without authenticated user");
  }

  const settings = await getAppSettings();
  const maxBodyLength =
    parseInt(settings["modules.posts.max_body_length"], 10) || 2000;

  const initialTab = "discover" as const;
  const page = await getFeedIds({
    tab: initialTab,
    viewerUserId: user.id,
  });
  const initialPosts = await getPostsByIds(page.ids, { viewerUserId: user.id });

  return (
    <div className="space-y-4">
      <Composer maxBodyLength={maxBodyLength} />
      <FeedList
        initialTab={initialTab}
        initialPosts={initialPosts}
        initialNextCursor={page.nextCursor}
        viewerUserId={user.id}
      />
    </div>
  );
}

export function PostsFeedSectionSkeleton() {
  return (
    <div className="space-y-4" aria-hidden>
      <div className="bg-gc-bg-2 border border-gc-line rounded-gc p-4 h-32 animate-pulse" />
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="bg-gc-bg-2 border border-gc-line rounded-gc p-5 h-32 animate-pulse"
          />
        ))}
      </div>
    </div>
  );
}
