"use client";
// components/modules/posts/PostCard.tsx
//
// Card presentational riusabile di un post nel feed. Riceve PostCardData
// già hydratato (vedi lib/modules/posts/types.ts) — niente fetch interni,
// niente accesso DB.
//
// Le interazioni (toggle reaction / bookmark, soft-delete) sono delegate
// alle Server Actions del modulo (lib/modules/posts/actions.ts) tramite
// `startTransition` + `useOptimistic` — la UI si aggiorna immediatamente
// e si riallinea al refetch se l'azione fallisce.
import { startTransition, useOptimistic, useState } from "react";
import Link from "next/link";
import type { PostCardData } from "@/lib/modules/posts/types";
import { POST_REACTION_KINDS, type PostReactionKind } from "@/lib/db/schema";
import {
  softDeletePost,
  toggleBookmark,
  toggleReaction,
} from "@/lib/modules/posts/actions";
import { PostBody } from "./PostBody";

const REACTION_EMOJI: Record<PostReactionKind, string> = {
  like: "❤️",
  rocket: "🚀",
  bull: "🐂",
  bear: "🐻",
  dump: "📉",
  diamond: "💎",
};

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

function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - new Date(date).getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return "ora";
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86_400) return `${Math.floor(sec / 3600)}h`;
  if (sec < 604_800) return `${Math.floor(sec / 86_400)}g`;
  return new Date(date).toLocaleDateString("it-IT", { day: "numeric", month: "short" });
}

type Props = {
  post: PostCardData;
  /** True quando viewer === author: abilita azioni come soft-delete. */
  isAuthor?: boolean;
};

export function PostCard({ post, isAuthor }: Props) {
  const [bookmarked, setBookmarked] = useOptimistic(
    post.viewer?.bookmarked ?? false,
  );
  const [ownReactions, setOwnReactions] = useOptimistic<PostReactionKind[]>(
    post.viewer?.ownReactions ?? [],
  );
  const [hidden, setHidden] = useState(false);

  if (hidden) {
    return (
      <div className="border border-gc-line/60 rounded-gc bg-gc-bg-2 p-4 text-sm text-gc-fg-muted">
        Post rimosso.
      </div>
    );
  }

  const onToggleReaction = (kind: PostReactionKind) => {
    const wasActive = ownReactions.includes(kind);
    startTransition(async () => {
      setOwnReactions(
        wasActive ? ownReactions.filter((r) => r !== kind) : [...ownReactions, kind],
      );
      const res = await toggleReaction({ postId: post.id, reaction: kind });
      if (!res.ok) {
        // riallinea con server
        setOwnReactions(post.viewer?.ownReactions ?? []);
      }
    });
  };

  const onToggleBookmark = () => {
    startTransition(async () => {
      setBookmarked(!bookmarked);
      const res = await toggleBookmark({ postId: post.id });
      if (!res.ok) setBookmarked(post.viewer?.bookmarked ?? false);
    });
  };

  const onSoftDelete = () => {
    if (!isAuthor) return;
    if (!window.confirm("Eliminare questo post? L'azione non è annullabile.")) return;
    startTransition(async () => {
      setHidden(true);
      const res = await softDeletePost({ postId: post.id });
      if (!res.ok) setHidden(false);
    });
  };

  return (
    <article className="bg-gc-bg-2 border border-gc-line rounded-gc p-5">
      {/* Header: avatar, autore, time, visibility */}
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
              {authorDisplayName(post.author).charAt(1)?.toUpperCase() || "?"}
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
            <time className="text-xs text-gc-fg-muted" dateTime={post.createdAt.toString()}>
              {formatRelativeTime(post.createdAt)}
            </time>
            {post.editedAt ? (
              <span className="text-xs text-gc-fg-muted" title={String(post.editedAt)}>
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
        {isAuthor ? (
          <button
            onClick={onSoftDelete}
            className="text-xs text-gc-fg-muted hover:text-gc-danger px-2"
            aria-label="Elimina post"
            type="button"
          >
            Elimina
          </button>
        ) : null}
      </header>

      {/* Body */}
      <PostBody body={post.body} />

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

      {/* Footer: reaction toolbar + counts */}
      <footer className="mt-4 flex items-center gap-1.5 flex-wrap">
        {POST_REACTION_KINDS.map((kind) => {
          const active = ownReactions.includes(kind);
          const count = post.counts.reactions[kind];
          return (
            <button
              key={kind}
              type="button"
              onClick={() => onToggleReaction(kind)}
              className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs ${
                active
                  ? "bg-gc-accent/15 text-gc-accent"
                  : "bg-transparent text-gc-fg-muted hover:bg-gc-line/40"
              }`}
              aria-pressed={active}
              aria-label={`Reaction ${kind}${count > 0 ? `, ${count}` : ""}`}
            >
              <span>{REACTION_EMOJI[kind]}</span>
              {count > 0 ? <span>{count}</span> : null}
            </button>
          );
        })}
        <div className="flex-1" />
        <Link
          href={`/post/${post.id}`}
          className="text-xs text-gc-fg-muted hover:text-gc-fg px-2 py-1"
        >
          💬 {post.counts.comments > 0 ? post.counts.comments : ""}
        </Link>
        <span className="text-xs text-gc-fg-muted px-2 py-1">
          ↗ {post.counts.reposts > 0 ? post.counts.reposts : ""}
        </span>
        <button
          type="button"
          onClick={onToggleBookmark}
          className={`text-xs px-2 py-1 rounded-full ${
            bookmarked ? "text-gc-accent" : "text-gc-fg-muted hover:text-gc-fg"
          }`}
          aria-pressed={bookmarked}
          aria-label="Bookmark"
        >
          {bookmarked ? "🔖" : "📑"}
        </button>
      </footer>
    </article>
  );
}
