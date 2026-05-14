"use client";
// components/modules/posts/NewPostButton.tsx
//
// Trigger per il composer in modale + toast post-publish. Due varianti:
//   - "sidebar"  → pill fullwidth, riusa lo stile del bottone esistente
//                  in AppSidebar al posto della "Nuova watchlist" stub
//   - "fab"      → bottone circolare per il FAB centrale di AppBottomNav
//
// Il toast è portallato a `document.body` con z-60 (Z.TOAST). Auto-hide
// dopo 5s, click chiama `router.refresh()` per ri-renderizzare gli RSC
// e portare il nuovo post in cima al feed senza ricaricare la pagina.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { PostComposerModal } from "./PostComposerModal";

type Variant = "sidebar" | "fab";

export function NewPostButton({ variant }: { variant: Variant }) {
  const [open, setOpen] = useState(false);
  const [publishedId, setPublishedId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!publishedId) return;
    const t = setTimeout(() => setPublishedId(null), 5000);
    return () => clearTimeout(t);
  }, [publishedId]);

  const onClickToast = () => {
    setPublishedId(null);
    router.refresh();
  };

  if (variant === "sidebar") {
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Nuovo post"
          className="mt-5 w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full bg-gc-accent text-white font-medium text-sm hover:brightness-95 transition"
        >
          <Plus size={16} strokeWidth={2.5} />
          <span>Nuovo post</span>
        </button>
        <PostComposerModal
          open={open}
          onOpenChange={setOpen}
          onPublished={setPublishedId}
        />
        {mounted && publishedId
          ? createPortal(
              <PublishedToast onClick={onClickToast} onDismiss={() => setPublishedId(null)} />,
              document.body,
            )
          : null}
      </>
    );
  }

  // variant === "fab"
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Nuovo post"
        className="w-12 h-12 rounded-full bg-gc-accent text-white flex items-center justify-center -mt-3 shadow-md hover:brightness-95 transition"
      >
        <Plus size={22} strokeWidth={2.5} />
      </button>
      <PostComposerModal
        open={open}
        onOpenChange={setOpen}
        onPublished={setPublishedId}
      />
      {mounted && publishedId
        ? createPortal(
            <PublishedToast onClick={onClickToast} onDismiss={() => setPublishedId(null)} />,
            document.body,
          )
        : null}
    </>
  );
}

function PublishedToast({
  onClick,
  onDismiss,
}: {
  onClick: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      // z-[60] = Z.TOAST. Posizione bottom-center mobile, bottom-right
      // ≥sm. Mobile si solleva di 4rem per non collidere col bottom-nav.
      className="fixed z-[60] left-1/2 -translate-x-1/2 bottom-20 sm:bottom-6 sm:left-auto sm:right-6 sm:translate-x-0"
    >
      <div className="flex items-center gap-2 bg-gc-bg-2 border border-gc-line rounded-gc shadow-lg px-3 py-2.5 min-w-[260px] max-w-[400px]">
        <button
          type="button"
          onClick={onClick}
          className="text-sm text-gc-fg text-left flex-1 hover:underline"
        >
          Post pubblicato · clicca per aggiornare
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Chiudi"
          className="text-gc-fg-muted hover:text-gc-fg p-1"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
