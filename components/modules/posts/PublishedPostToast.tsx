"use client";
// components/modules/posts/PublishedPostToast.tsx
//
// Toast "Post pubblicato" portallato a document.body. Estratto dal
// NewPostButton per essere riusato anche dal flow quote-repost in
// PostCard (entrambi pubblicano un post che merita lo stesso feedback).
//
// API minimale: passa `postId` quando hai un nuovo post pubblicato;
// quando vuoi dismetterlo passa `null` (o aspetta i 5s di auto-dismiss).
// Il componente è "controlled" dal parent ma incapsula portal +
// auto-dismiss timer + mount check (per evitare SSR mismatch).
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";

type Props = {
  /** ID del post appena pubblicato; null = toast nascosto. */
  postId: string | null;
  /** Chiamato quando l'utente clicca X, clicca il link, o scadono i 5s. */
  onDismiss: () => void;
  /** Durata auto-dismiss in ms (default 5000). */
  autoDismissMs?: number;
};

export function PublishedPostToast({
  postId,
  onDismiss,
  autoDismissMs = 5000,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const tNp = useTranslations("posts.new_post");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!postId) return;
    const t = setTimeout(onDismiss, autoDismissMs);
    return () => clearTimeout(t);
  }, [postId, autoDismissMs, onDismiss]);

  if (!mounted || !postId) return null;

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      // z-[60] = Z.TOAST. Top-center. Mobile e desktop stesso layout.
      className="fixed z-[60] top-4 left-1/2 -translate-x-1/2 max-w-[calc(100vw-2rem)]"
    >
      <div className="flex items-center gap-2 bg-emerald-600 text-white rounded-gc shadow-lg pl-4 pr-2 py-2.5 min-w-[280px]">
        <span className="text-sm flex-1">
          {tNp("toast_published_prefix")}
          <Link
            href={`/post/${postId}`}
            onClick={onDismiss}
            className="underline decoration-white/60 underline-offset-2 hover:decoration-white"
          >
            {tNp("toast_view_link")}
          </Link>
        </span>
        <button
          type="button"
          onClick={onDismiss}
          aria-label={tNp("toast_close_aria")}
          className="text-white/80 hover:text-white p-1"
        >
          <X size={14} />
        </button>
      </div>
    </div>,
    document.body,
  );
}
