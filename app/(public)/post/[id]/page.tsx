// app/(public)/post/[id]/page.tsx
//
// Pagina singolo post. Adaptive shell (PublicAdaptiveShell):
//   - Anon → PublicHeader marketing + footer
//   - Loggato → ProtectedShell con sidebar/rail/navigation
// Il fetching è delegato all'helper `getPostPageData()`
// (lib/modules/posts/post-page-data.ts) — single source of data
// condiviso con la modale intercepting `@modal/(.)post/[id]/page.tsx`,
// niente drift di logica/parametri.
//
// SEO: generateMetadata genera OG/Twitter da body/autore/prima media,
// robots noindex se visibility != public. La sitemap è in
// `app/(public)/post/sitemap.ts` (solo post pubblici).
//
// Spostato da (protected) a (public) il 2026-05-22 — pattern allineato
// a /coins/[symbol] e /u/[username]. notFound() PRIMA dello shell così
// l'unwind raggiunge il root not-found senza essere wrappato.
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getUser } from "@/lib/db/queries";
import { getCachedPostBySlugForMetadata } from "@/lib/modules/posts/queries";
import { getPostPageData } from "@/lib/modules/posts/post-page-data";
import { generatePageMetadata } from "@/lib/seo";
import { PostCard } from "@/components/modules/posts/PostCard";
import { CommentsThread } from "@/components/modules/posts/CommentsThread";
import { PublicAdaptiveShell } from "@/components/layout/PublicAdaptiveShell";

type Params = { id: string };

const TITLE_MAX_CHARS = 60;
const DESCRIPTION_MAX_CHARS = 160;

function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 1).trimEnd() + "…";
}

function postAuthorLabel(author: {
  username: string | null;
  firstName: string | null;
  lastName: string | null;
}): string {
  if (author.username) return `@${author.username}`;
  const full = [author.firstName, author.lastName].filter(Boolean).join(" ");
  return full || "user";
}

/**
 * Metadata SEO + share social. Chiama il wrapper cached
 * `getCachedPostBySlugForMetadata` (5min TTL + tag `post:{id}`),
 * non `getPostBySlug` raw: il path generateMetadata è il più caldo
 * (ogni preview link / crawler / bot hit lo invoca) ed era 1 query DB
 * per ogni hit.
 *
 * Post non pubblici → wrapper ritorna null (gate visibility con
 * viewerUserId undefined) → metadata fallback `Post` + noindex.
 * Niente leakage di body/author di post private/followers.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { id } = await params;
  // Viewer anonimo: i bot non sono loggati, quindi solo i post public
  // hanno dati. Per altri, il wrapper cached ritorna null → metadata
  // generica + noindex. Cache 5min + tag `post:{id}` invalidato dalle
  // 3 Server Action che cambiano body/author/visibility/media
  // (editPost, softDeletePost, restorePost). Hot path: ogni preview
  // link social, ogni crawler bot, ogni share — skip query DB.
  const post = await getCachedPostBySlugForMetadata(id);
  const pathname = `/post/${id}`;

  if (!post) {
    return {
      title: "Post",
      robots: { index: false, follow: false },
    };
  }

  const authorLabel = postAuthorLabel(post.author);
  const bodyShort = truncate(post.body, DESCRIPTION_MAX_CHARS);
  const titleShort = truncate(post.body, TITLE_MAX_CHARS);
  const title = `${authorLabel}: ${titleShort}`;
  const image = post.media[0]?.fullUrl;

  const meta = await generatePageMetadata(pathname, {
    title,
    description: bodyShort,
    ...(image ? { image } : {}),
  });
  if (post.visibility !== "public") {
    meta.robots = { index: false, follow: false };
  }
  return meta;
}

export default async function PostPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;
  const user = await getUser();
  const data = await getPostPageData(id, user?.id);
  // notFound() PRIMA dello shell: stesso pattern di /coins/[symbol]
  // e /u/[username]. L'unwind raggiunge il root not-found senza essere
  // wrappato. Viewer loggato che ha "perso" l'accesso (block/delete)
  // viene reindirizzato al feed invece di vedere 404.
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
    <PublicAdaptiveShell>
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
    </PublicAdaptiveShell>
  );
}
