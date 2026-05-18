// app/(protected)/@modal/(.)post/[id]/page.tsx
//
// Intercepting route: quando l'utente è già DENTRO (protected) e
// naviga verso /post/[id] (es. click su una PostCard), Next.js
// intercetta la navigazione e renderizza QUESTA page dentro lo slot
// @modal del layout invece della page standalone /post/[id].
//
// Refresh dello stesso URL, share, deep-link → Next salta l'intercept
// e renderizza la page standalone normale (SEO/share intatti).
//
// Single source of data: `getPostPageData()` — STESSI dati della
// page standalone, niente drift. Il post non trovato lascia lo slot
// vuoto (modale non si apre), il feed sotto resta invariato.
import { getUser } from "@/lib/db/queries";
import { getPostPageData } from "@/lib/modules/posts/post-page-data";
import { PostModalContainer } from "@/components/modules/posts/PostModalContainer";

type Params = { id: string };

export default async function InterceptedPostModal({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;
  const user = await getUser();
  const data = await getPostPageData(id, user?.id);
  if (!data) return null;

  return (
    <PostModalContainer
      data={data}
      viewer={
        user
          ? {
              id: user.id,
              username: user.username,
              firstName: user.firstName,
              lastName: user.lastName,
              avatarUrl: user.avatarUrl,
              headline: user.headline,
            }
          : null
      }
    />
  );
}
