// app/(protected)/post/[id]/page.tsx
//
// Pagina singolo post (versione minimale PR-5c). Vista loggata dello
// stesso PostCard usato in feed. Il fetching è delegato all'helper
// `getPostPageData()` (lib/modules/posts/post-page-data.ts) — single
// source of data condiviso con la modale intercepting
// `@modal/(.)post/[id]/page.tsx`, niente drift di logica/parametri.
//
// PR-9 espanderà:
//   - SEO meta (OG/Twitter card per condivisione esterna)
//   - Anonymous via adaptive (public)/ layout
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
import { getPostPageData } from "@/lib/modules/posts/post-page-data";
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
  const data = await getPostPageData(id, user?.id);
  if (!data) {
    if (user) redirect("/");
    notFound();
  }

  const {
    post,
    coinNameMap,
    commentsConfig,
    tickerPreviewMap,
    rootPage,
    initialReplies,
  } = data;
  const isAuthor = user?.id === post.author.id;

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
                  headline: user.headline,
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
