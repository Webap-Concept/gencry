"use client";
// components/modules/posts/PostCard.tsx
//
// Card presentational riusabile di un post. Riceve PostCardData
// hydratato (vedi lib/modules/posts/types.ts).
//
// Layout (v2 dopo manual UX review):
//
//   ┌────────────────────────────────────────────┐
//   │ [Avatar] @user · time · 🌐    [X] [⋯]     │
//   │                                            │
//   │ body con $TICKER / @mention auto-linkati   │
//   │ ticker chips, quote-repost embed, ...      │
//   │                                            │
//   │ [😀 12]   [💬 3]   [↗ 1]                    │
//   └────────────────────────────────────────────┘
//
//  Top-right:
//    X    → nasconde la card per la sessione (no DB call)
//    ⋯    → DropdownMenu con azioni context-aware (autore:
//           Modifica/Elimina; viewer: Salva/Segnala/Nascondi)
//  Footer:
//    Reactions → popover 6 emoji (hover desktop, click mobile)
//    Commenta  → link a /post/{id}
//    Repost    → solo conteggio in v1 (UI quote-repost rinviata)
import { startTransition, useOptimistic, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MessageCircle, MoreHorizontal, Repeat2, X } from "lucide-react";
import type { PostCardData } from "@/lib/modules/posts/types";
import type { PostReactionKind } from "@/lib/db/schema";
import {
  reportPost,
  softDeletePost,
  toggleBookmark,
  toggleReaction,
} from "@/lib/modules/posts/actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PostBody } from "./PostBody";
import { PostMediaGallery } from "./PostMediaGallery";
import { ReactionPopover } from "./ReactionPopover";

const VISIBILITY_LABEL: Record<PostCardData["visibility"], string> = {
  public: "Tutti",
  members: "Community",
  followers: "Chi mi segue",
  private: "Solo io",
};

function authorDisplayName(author: PostCardData["author"]): string {
  if (author.username) return `@${author.username}`;
  const full = [author.firstName, author.lastName].filter(Boolean).join(" ");
  return full || "Utente";
}

function authorInitial(author: PostCardData["author"]): string {
  const f =
    (author.username ?? author.firstName ?? "?")[0] ?? "?";
  return f.toUpperCase();
}

function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - new Date(date).getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return "ora";
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86_400) return `${Math.floor(sec / 3600)}h`;
  if (sec < 604_800) return `${Math.floor(sec / 86_400)}g`;
  return new Date(date).toLocaleDateString("it-IT", {
    day: "numeric",
    month: "short",
  });
}

type Props = {
  post: PostCardData;
  /** True quando viewer === author: sblocca Modifica/Elimina nel menu. */
  isAuthor?: boolean;
  /**
   * "feed"   — la card è clickable verso /post/{id}, la gallery è
   *            il carousel "max 2 visibili" (default).
   * "single" — la card è NON clickable (siamo già su /post/{id}) e
   *            la gallery è uno stack verticale con tutte le foto.
   */
  variant?: "feed" | "single";
};

export function PostCard({ post, isAuthor, variant = "feed" }: Props) {
  const router = useRouter();
  const [bookmarked, setBookmarked] = useOptimistic(
    post.viewer?.bookmarked ?? false,
  );
  // Server returns ownReactions[] for backwards-compat, ma per regola
  // applicativa "1 utente → 1 reaction" prendiamo solo il primo.
  const initialOwnReaction: PostReactionKind | null =
    post.viewer?.ownReactions?.[0] ?? null;
  const [ownReaction, setOwnReaction] = useOptimistic<PostReactionKind | null>(
    initialOwnReaction,
  );
  const [hidden, setHidden] = useState(false);
  const [deleted, setDeleted] = useState(false);

  if (hidden || deleted) return null;

  const onToggleReaction = (kind: PostReactionKind) => {
    const wasActive = ownReaction === kind;
    startTransition(async () => {
      // Optimistic: stessa kind → off, diversa → switch
      setOwnReaction(wasActive ? null : kind);
      const res = await toggleReaction({ postId: post.id, reaction: kind });
      if (!res.ok) setOwnReaction(initialOwnReaction);
    });
  };

  const onToggleBookmark = () => {
    startTransition(async () => {
      setBookmarked(!bookmarked);
      const res = await toggleBookmark({ postId: post.id });
      if (!res.ok) setBookmarked(post.viewer?.bookmarked ?? false);
    });
  };

  const onDelete = () => {
    if (!isAuthor) return;
    if (!window.confirm("Eliminare questo post? L'azione non è annullabile.")) return;
    startTransition(async () => {
      setDeleted(true);
      const res = await softDeletePost({ postId: post.id });
      if (!res.ok) setDeleted(false);
    });
  };

  const onReport = () => {
    const reasonInput = window.prompt(
      "Motivo del report (spam, scam, abuse, other):",
      "spam",
    );
    if (!reasonInput) return;
    const reason = reasonInput.toLowerCase().trim() as
      | "spam"
      | "scam"
      | "abuse"
      | "other";
    if (!["spam", "scam", "abuse", "other"].includes(reason)) {
      window.alert("Motivo non valido.");
      return;
    }
    startTransition(async () => {
      const res = await reportPost({ postId: post.id, reason });
      if (res.ok) window.alert("Grazie, il report è stato inviato.");
      else window.alert("Impossibile inviare il report.");
    });
  };

  // Reactions total da counters denormalizzati (1 lettura, niente sum
  // ricomputato a render time — già aggregato in PostCounts.reactionsTotal).
  const reactionsTotal = post.counts.reactionsTotal;

  // Card-level click → naviga al single-post. Solo variant=feed.
  // Skippa la nav se il click ha colpito un elemento interattivo
  // (a, button, input, label, summary, [role=button]). Così avatar
  // Link, reactions popover, dropdown ⋯, X hide, gallery tiles, ecc.
  // continuano a fare il loro job.
  const cardClickable = variant === "feed";
  const onCardClick = (e: React.MouseEvent<HTMLElement>) => {
    if (!cardClickable) return;
    const target = e.target as HTMLElement;
    if (target.closest("a, button, input, label, summary, [role='button'], [role='menuitem']")) return;
    // Solo click sinistro senza modifier (let cmd+click open new tab fail-safe).
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    router.push(`/post/${post.id}`);
  };

  return (
    <article
      onClick={onCardClick}
      className={`bg-gc-bg-2 border border-gc-line rounded-gc p-5 ${
        cardClickable ? "cursor-pointer hover:bg-gc-bg-2/80 transition-colors" : ""
      }`}
    >
      {/* Header: autore + time + visibility */}
      <header className="flex items-start gap-3 mb-3">
        <Link
          href={`/profile/${post.author.username ?? post.author.id}`}
          className="shrink-0"
        >
          {post.author.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={post.author.avatarUrl}
              alt=""
              className="w-10 h-10 rounded-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-gc-line flex items-center justify-center text-sm text-gc-fg-muted">
              {authorInitial(post.author)}
            </div>
          )}
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <Link
              href={`/profile/${post.author.username ?? post.author.id}`}
              className="font-medium text-gc-fg hover:underline"
            >
              {authorDisplayName(post.author)}
            </Link>
            <span className="text-xs text-gc-fg-muted">·</span>
            <Link
              href={`/post/${post.id}`}
              className="text-xs text-gc-fg-muted hover:underline"
            >
              <time dateTime={String(post.createdAt)}>
                {formatRelativeTime(post.createdAt)}
              </time>
            </Link>
            {post.editedAt ? (
              <span
                className="text-xs text-gc-fg-muted"
                title={String(post.editedAt)}
              >
                · modificato
              </span>
            ) : null}
            {post.visibility !== "public" ? (
              <span className="text-xs text-gc-fg-muted px-1.5 py-0.5 rounded bg-gc-line/40">
                {VISIBILITY_LABEL[post.visibility]}
              </span>
            ) : null}
          </div>
        </div>
        {/* Top-right toolbar */}
        <div className="flex items-center gap-0.5 shrink-0 -mr-1 -mt-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Opzioni post"
                className="w-8 h-8 rounded-full flex items-center justify-center text-gc-fg-muted hover:bg-gc-bg-3 hover:text-gc-fg"
              >
                <MoreHorizontal size={18} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="min-w-[200px] bg-gc-modal-bg border-gc-modal-border text-gc-fg"
            >
              <DropdownMenuItem onSelect={onToggleBookmark}>
                {bookmarked ? "Rimuovi dai salvati" : "Salva post"}
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/post/${post.id}`}>Apri post</Link>
              </DropdownMenuItem>
              {!isAuthor ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={onReport}>
                    Segnala
                  </DropdownMenuItem>
                </>
              ) : null}
              {isAuthor ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={onDelete}
                    className="text-gc-danger focus:text-gc-danger"
                  >
                    Elimina post
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            type="button"
            onClick={() => setHidden(true)}
            aria-label="Nascondi post"
            className="w-8 h-8 rounded-full flex items-center justify-center text-gc-fg-muted hover:bg-gc-bg-3 hover:text-gc-fg"
          >
            <X size={16} />
          </button>
        </div>
      </header>

      {/* Body */}
      <PostBody body={post.body} />

      {/* Media gallery */}
      {post.media.length > 0 ? (
        <PostMediaGallery media={post.media} variant={variant} />
      ) : null}

      {/* Ticker chips */}
      {post.tickers.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {post.tickers.map((t) => (
            <Link
              key={t}
              href={`/explore?ticker=${t}`}
              className="text-[11px] px-2 py-0.5 rounded-full bg-gc-line/40 text-gc-fg hover:bg-gc-line/60"
            >
              ${t}
            </Link>
          ))}
        </div>
      ) : null}

      {/* Quote repost embed (depth 1) */}
      {post.repostOf ? (
        <div className="mt-3 border border-gc-line/60 rounded-gc-sm p-3 bg-gc-bg-1">
          <div className="text-xs text-gc-fg-muted mb-1">
            ↪ {authorDisplayName(post.repostOf.author)}
          </div>
          <PostBody body={post.repostOf.body} />
        </div>
      ) : post.repostOfTombstone ? (
        <div className="mt-3 border border-gc-line/60 rounded-gc-sm p-3 bg-gc-bg-1 text-sm text-gc-fg-muted italic">
          Post originale rimosso
        </div>
      ) : null}

      {/* Footer: 3 azioni — Reactions / Commenta / Repost */}
      <footer className="mt-4 flex items-center gap-1">
        <ReactionPopover
          ownReaction={ownReaction}
          counts={post.counts.reactions}
          totalCount={reactionsTotal}
          onToggle={onToggleReaction}
        />
        <Link
          href={`/post/${post.id}`}
          aria-label={`Commenti${post.counts.comments > 0 ? `, ${post.counts.comments}` : ""}`}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm text-gc-fg-muted hover:bg-gc-bg-3 hover:text-gc-fg transition"
        >
          <MessageCircle size={18} strokeWidth={1.75} />
          {post.counts.comments > 0 ? <span>{post.counts.comments}</span> : null}
        </Link>
        <button
          type="button"
          aria-label={`Repost${post.counts.reposts > 0 ? `, ${post.counts.reposts}` : ""}`}
          // L'azione quote-repost arriverà in una PR successiva: per ora
          // mostriamo solo il count. Click no-op (cursor-default) per
          // non confondere l'utente.
          disabled
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm text-gc-fg-muted disabled:cursor-not-allowed"
        >
          <Repeat2 size={18} strokeWidth={1.75} />
          {post.counts.reposts > 0 ? <span>{post.counts.reposts}</span> : null}
        </button>
      </footer>
    </article>
  );
}
