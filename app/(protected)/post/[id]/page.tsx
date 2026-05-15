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
import { getPostBySlug } from "@/lib/modules/posts/queries";
import { getCoinNameMap } from "@/lib/modules/prices/queries";
import { PostCard } from "@/components/modules/posts/PostCard";

type Params = { id: string };

export default async function PostPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;
  const user = await getUser();
  const [post, coinNameMap] = await Promise.all([
    getPostBySlug(id, { viewerUserId: user?.id }),
    getCoinNameMap(),
  ]);
  if (!post) {
    if (user) redirect("/");
    notFound();
  }

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
      />
    </div>
  );
}
