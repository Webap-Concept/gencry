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
// Per ora: 404 se il viewer non ha accesso (visibility gate in
// getPostBySlug). 404 invece di 403 per non rivelare l'esistenza
// (allineato con il design di project_module_posts §SEO).
import { notFound } from "next/navigation";
import { getUser } from "@/lib/db/queries";
import { getPostBySlug } from "@/lib/modules/posts/queries";
import { PostCard } from "@/components/modules/posts/PostCard";

type Params = { id: string };

export default async function PostPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;
  const user = await getUser();
  const post = await getPostBySlug(id, { viewerUserId: user?.id });
  if (!post) notFound();

  const isAuthor = user?.id === post.author.id;

  return (
    <div className="max-w-2xl mx-auto py-6 px-4 space-y-4">
      <PostCard post={post} isAuthor={isAuthor} variant="single" />
    </div>
  );
}
