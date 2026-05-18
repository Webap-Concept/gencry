"use client";
// components/modules/posts/PostModalContainer.tsx
//
// Wrapper modale per la vista singolo post intercettata da Next.js
// intercepting routes (@modal/(.)post/[id]). Chiude → router.back()
// per tornare al feed sotto (scroll preservato, no re-fetch).
//
// NOTA: NON usa <GcModal> di proposito. Eccezione documentata in
// memory feedback_gc_modal_primitive: PostCard ha già il proprio
// chrome (header autore + footer azioni), serve solo un container
// scrollable con close button minimal. Stesso pattern di
// PostComposerModal. DialogTitle è sr-only per a11y Radix.
//
// Riceve dati + viewer dalla server intercepting page e orchestria
// PostCard + CommentsThread internamente. Wrappa le mutation di
// delete/block del PostCard cabling le callback su router.back() —
// la page standalone usa i redirectAfter* tradizionali.
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { PostCard } from "@/components/modules/posts/PostCard";
import { CommentsThread } from "@/components/modules/posts/CommentsThread";
import type { PostPageData } from "@/lib/modules/posts/post-page-data";

type ViewerProfile = {
  id: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  headline: string | null;
};

type Props = {
  data: PostPageData;
  /** Null = viewer anonimo (caso raro nel @modal di (protected), ma
   *  resta safe perché la page sotto gestisce notFound/redirect). */
  viewer: ViewerProfile | null;
};

const EDIT_WINDOW_MS = 10 * 60_000;

export function PostModalContainer({ data, viewer }: Props) {
  const router = useRouter();
  const t = useTranslations("posts.card");
  const {
    post,
    coinNameMap,
    commentsConfig,
    tickerPreviewMap,
    rootPage,
    initialReplies,
  } = data;
  const isAuthor = viewer?.id === post.author.id;
  const authorDisplay =
    post.author.username
      ? `@${post.author.username}`
      : [post.author.firstName, post.author.lastName]
          .filter(Boolean)
          .join(" ") || "user";

  // open=true sempre: la modale esiste solo quando intercepting matcha.
  // onOpenChange(false) → router.back() pop-a l'URL e dismonta lo slot,
  // il feed sotto resta vivo (Next.js parallel routes magic).
  const close = () => router.back();
  const handleOpenChange = (next: boolean) => {
    if (!next) close();
  };

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent
        className="w-[calc(100vw-2rem)] sm:w-full sm:max-w-2xl p-0 max-h-[90vh] overflow-hidden flex flex-col"
        showCloseButton
      >
        <DialogTitle className="sr-only">
          {t("open_post")} — {authorDisplay}
        </DialogTitle>
        {/* pt-14: la X built-in del DialogContent è in absolute top-4
            right-4 (h-7). Serve almeno ~52px di padding-top altrimenti
            la X copre l'header della PostCard. */}
        <div className="overflow-y-auto px-4 pb-4 pt-14 sm:px-5 sm:pb-5 space-y-4">
          {/* Delete/block confermati nella modale → router.back (chiude
              lo slot + lascia il feed sotto). PostCard usa le callback
              prima dei redirectAfter*. */}
          <PostCard
            post={post}
            isAuthor={isAuthor}
            variant="single"
            coinNameMap={coinNameMap}
            tickerPreviewMap={tickerPreviewMap}
            onDeleted={close}
            onBlocked={close}
          />
          <section className="border-t border-gc-line/40 pt-4">
            <CommentsThread
              postId={post.id}
              postVisibility={post.visibility}
              viewerUserId={viewer?.id}
              viewerProfile={
                viewer
                  ? {
                      username: viewer.username,
                      firstName: viewer.firstName,
                      lastName: viewer.lastName,
                      avatarUrl: viewer.avatarUrl,
                      headline: viewer.headline,
                    }
                  : undefined
              }
              liveMode={commentsConfig.liveModePostPage}
              pollIntervalSeconds={commentsConfig.pollIntervalSeconds}
              repliesInitialCount={commentsConfig.repliesInitialCount}
              maxBodyLength={commentsConfig.maxBodyLength}
              editWindowMs={EDIT_WINDOW_MS}
              initialData={{
                root: rootPage.comments,
                replies: initialReplies,
                nextRootCursor: rootPage.nextCursor,
              }}
              coinNameMap={coinNameMap}
            />
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
