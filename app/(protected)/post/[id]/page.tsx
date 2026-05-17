// app/(protected)/post/[id]/page.tsx
//
// Pagina singolo post (versione minimale PR-5c). Vista loggata dello
// stesso PostCard usato in feed.
//
// PR-9 espanderà:
//   - SEO meta (OG/Twitter card per condivisione esterna)
//   - Anonymous via adaptive (public)/ layout
//   - Comments thread inline + composer commento
//   - URL friendly con slug autore
//
// Comportamento "post non trovato":
//   - Viewer anonimo  → notFound() (SEO-friendly 404 per i bot)
//   - Viewer loggato  → redirect("/") al feed. Why: la 404 dentro il
//     route group (protected) viene wrappata dal layout del gruppo
//     (sidebar/rail/banner) — UX confusa, l'utente non sa cosa fare.
//     Redirect al feed è il prossimo step naturale dopo "post sparito"
//     (block/cancellazione/visibility che restringe). Vedi memory
//     project_nextjs_notfound_layout.
import { notFound, redirect } from "next/navigation";
import { getUser } from "@/lib/db/queries";
import {
  getPostBySlug,
  getInitialRepliesForRoots,
  getRootCommentsForPost,
} from "@/lib/modules/posts/queries";
import { getCoinNameMap } from "@/lib/modules/prices/queries";
import { getTickerPreviewBatch } from "@/lib/modules/posts/ticker-preview-actions";
import { collectVisibleTickers } from "@/lib/modules/posts/lib/collect-visible-tickers";
import { loadCommentsConfig } from "@/lib/modules/posts/comments-config";
import { PostCard } from "@/components/modules/posts/PostCard";
import { CommentsThread } from "@/components/modules/posts/CommentsThread";

type Params = { id: string };

export default async function PostPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;
  const user = await getUser();
  const [post, coinNameMap, commentsConfig] = await Promise.all([
    getPostBySlug(id, { viewerUserId: user?.id }),
    getCoinNameMap(),
    loadCommentsConfig(),
  ]);
  if (!post) {
    if (user) redirect("/");
    notFound();
  }

  const isAuthor = user?.id === post.author.id;

  // SSR prefetch: ticker preview + comments root (+ initial replies)
  // in parallelo. La page detail è il golden path utente concentrato,
  // val la pena pagare 2 query extra per first-paint zero-latency.
  const [tickerPreviewMap, rootPage] = await Promise.all([
    getTickerPreviewBatch(collectVisibleTickers([post])),
    getRootCommentsForPost({ postId: post.id, viewerUserId: user?.id }),
  ]);
  const initialReplies =
    rootPage.comments.length === 0
      ? {}
      : await getInitialRepliesForRoots({
          rootIds: rootPage.comments.map((c) => c.id),
          perRoot: commentsConfig.repliesInitialCount,
          viewerUserId: user?.id,
        });

  return (
    <div className="max-w-2xl mx-auto py-6 px-4 space-y-4">
      <PostCard
        post={post}
        isAuthor={isAuthor}
        variant="single"
        redirectAfterBlock="/"
        redirectAfterDelete="/"
        coinNameMap={coinNameMap}
        tickerPreviewMap={tickerPreviewMap}
      />
      <section className="border-t border-gc-line/40 pt-4">
        <CommentsThread
          postId={post.id}
          postVisibility={post.visibility}
          viewerUserId={user?.id}
          viewerProfile={
            user
              ? {
                  username: user.username,
                  firstName: user.firstName,
                  lastName: user.lastName,
                  avatarUrl: user.avatarUrl,
                }
              : undefined
          }
          liveMode={commentsConfig.liveModePostPage}
          pollIntervalSeconds={commentsConfig.pollIntervalSeconds}
          repliesInitialCount={commentsConfig.repliesInitialCount}
          maxBodyLength={commentsConfig.maxBodyLength}
          editWindowMs={10 * 60_000}
          initialData={{
            root: rootPage.comments,
            replies: initialReplies,
            nextRootCursor: rootPage.nextCursor,
          }}
          coinNameMap={coinNameMap}
        />
      </section>
    </div>
  );
}
