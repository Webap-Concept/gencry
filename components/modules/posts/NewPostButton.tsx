"use client";
// components/modules/posts/NewPostButton.tsx
//
// Trigger per il composer in modale + toast post-publish. Due varianti:
//   - "sidebar"  → pill fullwidth, riusa lo stile del bottone esistente
//                  in AppSidebar al posto della "Nuova watchlist" stub
//   - "fab"      → bottone circolare per il FAB centrale di AppBottomNav
//
// Toast: portallato a `document.body` con z-60 (Z.TOAST). Posizione
// top-center. Sfondo verde "success". Contiene un <Link> a `/post/{id}`
// così l'utente può raggiungere il post appena pubblicato in 1 click.
// Auto-dismiss dopo 5s.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Plus, X } from "lucide-react";
import useSWR from "swr";
import { PostComposerModal } from "./PostComposerModal";

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
  const [mounted, setMounted] = useState(false);
  const { data: user } = useSWR<CurrentUser>("/api/user", userFetcher, {
    revalidateOnFocus: false,
    keepPreviousData: true,
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!publishedId) return;
    const t = setTimeout(() => setPublishedId(null), 5000);
    return () => clearTimeout(t);
  }, [publishedId]);

  const Trigger = variant === "sidebar" ? (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label="Nuovo post"
      className="mt-5 w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full bg-gc-accent text-white font-medium text-sm hover:brightness-95 transition"
    >
      <Plus size={16} strokeWidth={2.5} />
      <span>Nuovo post</span>
    </button>
  ) : (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label="Nuovo post"
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
        onPublished={setPublishedId}
        user={user ?? null}
      />
      {mounted && publishedId
        ? createPortal(
            <PublishedToast
              postId={publishedId}
              onDismiss={() => setPublishedId(null)}
            />,
            document.body,
          )
        : null}
    </>
  );
}

function PublishedToast({
  postId,
  onDismiss,
}: {
  postId: string;
  onDismiss: () => void;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      // z-[60] = Z.TOAST. Top-center. Mobile e desktop stesso layout.
      className="fixed z-[60] top-4 left-1/2 -translate-x-1/2 max-w-[calc(100vw-2rem)]"
    >
      <div className="flex items-center gap-2 bg-emerald-600 text-white rounded-gc shadow-lg pl-4 pr-2 py-2.5 min-w-[280px]">
        <span className="text-sm flex-1">
          Post pubblicato ·{" "}
          <Link
            href={`/post/${postId}`}
            onClick={onDismiss}
            className="underline decoration-white/60 underline-offset-2 hover:decoration-white"
          >
            clicca per vederlo
          </Link>
        </span>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Chiudi"
          className="text-white/80 hover:text-white p-1"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
