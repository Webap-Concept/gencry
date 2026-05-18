"use client";
// components/modules/posts/CommentsBanner.tsx
//
// Banner "X nuovi commenti" non-disruptive (pattern GetStream). Si
// inserisce in cima al thread (sopra la lista root). Cliccato → fetch
// dei root mancanti dal cursor tail + reset del counter via
// `markSynced()` di `useCommentsLiveSignal`.
//
// Hide automatico quando count === 0. Animazione fade-in al primo
// arrivo, fade-out al click.
import { useTranslations } from "next-intl";
import { ArrowUp } from "lucide-react";

export type CommentsBannerProps = {
  count: number;
  onClick: () => void;
};

export function CommentsBanner({ count, onClick }: CommentsBannerProps) {
  const t = useTranslations("posts.comments");
  if (count <= 0) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-gc-sm bg-gc-pos/10 text-gc-pos border border-gc-pos/20 text-sm font-medium hover:bg-gc-pos/15 transition"
      aria-live="polite"
    >
      <ArrowUp size={14} strokeWidth={2} />
      {t("banner.new_comments", { count })}
    </button>
  );
}
