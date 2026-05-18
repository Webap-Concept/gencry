"use client";
// components/modules/posts/NewPostButton.tsx
//
// Trigger per il composer in modale + toast post-publish. Due varianti:
//   - "sidebar"  → pill fullwidth, riusa lo stile del bottone esistente
//                  in AppSidebar al posto della "Nuova watchlist" stub
//   - "fab"      → bottone circolare per il FAB centrale di AppBottomNav
//
// Toast post-publish: <PublishedPostToast> riusabile (lo monta anche
// PostCard dopo un quote-repost).
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import useSWR from "swr";
import type { PostVisibility } from "@/lib/db/schema";
import { getMyPostPreferences } from "@/lib/modules/posts/preferences-actions";
import { PostComposerModal } from "./PostComposerModal";
import { PublishedPostToast } from "./PublishedPostToast";

type Variant = "sidebar" | "fab";

type CurrentUser = {
  id: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
};

const userFetcher = (url: string) => fetch(url).then((r) => r.json());

export function NewPostButton({ variant }: { variant: Variant }) {
  const [open, setOpen] = useState(false);
  const [publishedId, setPublishedId] = useState<string | null>(null);
  const tNp = useTranslations("posts.new_post");
  const { data: user } = useSWR<CurrentUser>("/api/user", userFetcher, {
    revalidateOnFocus: false,
    keepPreviousData: true,
  });
  // Sticky default visibility (cross-device). Server Action come fetcher:
  // niente nuovo endpoint REST. SWR cache la chiamata; mutate dopo publish
  // così se l'utente apre un nuovo composer subito vede la nuova preferenza.
  const { data: defaultVisibility, mutate: mutateVisibility } =
    useSWR<PostVisibility>(
      user ? "posts:default-visibility" : null,
      async () => {
        const res = await getMyPostPreferences();
        return res.ok && res.data ? res.data.defaultVisibility : "public";
      },
      { revalidateOnFocus: false, keepPreviousData: true },
    );

  const Trigger = variant === "sidebar" ? (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label={tNp("button_aria")}
      className="mt-5 w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full bg-gc-accent text-white font-medium text-sm hover:brightness-95 transition"
    >
      <Plus size={16} strokeWidth={2.5} />
      <span>{tNp("button_aria")}</span>
    </button>
  ) : (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label={tNp("button_aria")}
      className="w-12 h-12 rounded-full bg-gc-accent text-white flex items-center justify-center -mt-3 shadow-md hover:brightness-95 transition"
    >
      <Plus size={22} strokeWidth={2.5} />
    </button>
  );

  return (
    <>
      {Trigger}
      <PostComposerModal
        open={open}
        onOpenChange={setOpen}
        onPublished={(postId) => {
          setPublishedId(postId);
          // createPost ha già aggiornato server-side la sticky preference:
          // re-fetch silenzioso per allineare la cache del prossimo open.
          mutateVisibility();
        }}
        user={user ?? null}
        initialDefaultVisibility={defaultVisibility}
      />
      <PublishedPostToast
        postId={publishedId}
        onDismiss={() => setPublishedId(null)}
      />
    </>
  );
}
