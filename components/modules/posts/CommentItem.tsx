"use client";
// components/modules/posts/CommentItem.tsx
//
// Singolo commento. Variante:
//   - "root"  → ha il bottone "Rispondi" + lista reply indented
//   - "reply" → indented, niente reply button (collassano sempre a livello 2)
//
// Tombstone: se `body === null` o `isDeleted=true` mostra placeholder.
// L'autore vede l'azione "Modifica" entro la finestra di edit; tutti
// vedono "Elimina" se ownership o moderator (gated da prop).
import { useState } from "react";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import {
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CommentCardData } from "@/lib/modules/posts/types";
import { PostBody } from "./PostBody";

function authorDisplayName(author: CommentCardData["author"], fallback: string): string {
  if (author.username) return `@${author.username}`;
  const full = [author.firstName, author.lastName].filter(Boolean).join(" ");
  return full || fallback;
}

function authorInitial(author: CommentCardData["author"]): string {
  return ((author.username ?? author.firstName ?? "?")[0] ?? "?").toUpperCase();
}

function formatRelativeTime(
  date: Date,
  t: (key: string, values?: Record<string, number>) => string,
  locale: string,
): string {
  const diffMs = Date.now() - new Date(date).getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return t("now");
  if (sec < 3600) return t("minutes_short", { n: Math.floor(sec / 60) });
  if (sec < 86_400) return t("hours_short", { n: Math.floor(sec / 3600) });
  if (sec < 604_800) return t("days_short", { n: Math.floor(sec / 86_400) });
  return new Date(date).toLocaleDateString(locale, { day: "numeric", month: "short" });
}

export type CommentItemProps = {
  comment: CommentCardData;
  variant: "root" | "reply";
  viewerUserId?: string;
  canModerate?: boolean;
  editWindowMs?: number;
  /** Tombstone: il commento è soft-deleted ma è mantenuto perché ha
   *  reply visibili. UI mostra "Commento rimosso" + reply intatte. */
  isDeletedTombstone?: boolean;
  onReplyClick?: () => void;
  onEdit?: (newBody: string) => Promise<{ ok: boolean; error?: string }>;
  onDelete?: () => Promise<{ ok: boolean; error?: string }>;
  /** Mappa name→symbol per inline matching ticker nel body. */
  coinNameMap?: Record<string, string>;
};

export function CommentItem({
  comment,
  variant,
  viewerUserId,
  canModerate,
  editWindowMs = 10 * 60_000,
  isDeletedTombstone,
  onReplyClick,
  onEdit,
  onDelete,
  coinNameMap,
}: CommentItemProps) {
  const t = useTranslations("posts.comments");
  const tCommon = useTranslations("posts.common");
  const tTime = useTranslations("posts.time");
  const locale = useLocale();
  const fallback = tCommon("user_fallback");

  const isOwn = viewerUserId === comment.author.id;
  const ageMs = Date.now() - new Date(comment.createdAt).getTime();
  const canEdit = isOwn && ageMs <= editWindowMs && onEdit && !isDeletedTombstone;
  const canDelete = (isOwn || canModerate) && onDelete && !isDeletedTombstone;

  const [editing, setEditing] = useState(false);
  const [editingBody, setEditingBody] = useState(comment.body);
  const [busy, setBusy] = useState(false);

  async function handleSaveEdit() {
    if (!onEdit) return;
    const trimmed = editingBody.trim();
    if (trimmed.length === 0 || trimmed === comment.body) {
      setEditing(false);
      return;
    }
    setBusy(true);
    const res = await onEdit(trimmed);
    setBusy(false);
    if (res.ok) {
      setEditing(false);
    }
  }

  async function handleDelete() {
    if (!onDelete) return;
    setBusy(true);
    await onDelete();
    setBusy(false);
  }

  const indentCls = variant === "reply" ? "pl-9" : "";
  const avatarSizeCls = variant === "reply" ? "w-7 h-7 text-[11px]" : "w-9 h-9 text-xs";

  return (
    <div className={`flex gap-2.5 ${indentCls}`}>
      {/* Avatar */}
      {comment.author.avatarUrl ? (
        <Link
          href={comment.author.username ? `/profile/${comment.author.username}` : "#"}
          className={`${avatarSizeCls} shrink-0 rounded-full overflow-hidden bg-gc-bg-3`}
          aria-label={authorDisplayName(comment.author, fallback)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={comment.author.avatarUrl}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </Link>
      ) : (
        <Link
          href={comment.author.username ? `/profile/${comment.author.username}` : "#"}
          className={`${avatarSizeCls} shrink-0 rounded-full bg-gc-bg-3 text-gc-fg-muted flex items-center justify-center font-medium`}
          aria-label={authorDisplayName(comment.author, fallback)}
        >
          {authorInitial(comment.author)}
        </Link>
      )}

      {/* Body */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-xs">
          <Link
            href={comment.author.username ? `/profile/${comment.author.username}` : "#"}
            className="font-medium text-gc-fg hover:underline"
          >
            {authorDisplayName(comment.author, fallback)}
          </Link>
          {comment.author.headline ? (
            <span className="text-gc-fg-muted truncate min-w-0 flex-1">
              · {comment.author.headline}
            </span>
          ) : null}
          {comment.editedAt ? (
            <span className="text-gc-fg-muted/80 italic">({t("edited")})</span>
          ) : null}
          <time
            className="text-gc-fg-muted ml-auto"
            dateTime={new Date(comment.createdAt).toISOString()}
          >
            {formatRelativeTime(comment.createdAt, tTime, locale)}
          </time>
          {(canEdit || canDelete) && !editing ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                className="p-1 rounded-full text-gc-fg-muted hover:text-gc-fg hover:bg-gc-bg-3 transition"
                aria-label={tCommon("more_actions")}
              >
                <MoreHorizontal size={14} strokeWidth={1.75} />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="min-w-[160px] bg-gc-modal-bg border-gc-modal-border text-gc-fg"
              >
                {canEdit ? (
                  <DropdownMenuItem onClick={() => setEditing(true)}>
                    <Pencil size={14} strokeWidth={1.75} className="mr-2" />
                    {tCommon("edit")}
                  </DropdownMenuItem>
                ) : null}
                {canDelete ? (
                  <DropdownMenuItem
                    onClick={handleDelete}
                    className="text-gc-neg"
                  >
                    <Trash2 size={14} strokeWidth={1.75} className="mr-2" />
                    {tCommon("delete")}
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>

        {isDeletedTombstone ? (
          <p className="text-sm text-gc-fg-muted italic mt-0.5">
            {t("tombstone")}
          </p>
        ) : editing ? (
          <div className="mt-1.5 flex gap-2 items-end">
            <textarea
              value={editingBody}
              onChange={(e) => setEditingBody(e.target.value)}
              rows={2}
              className="flex-1 resize-y bg-gc-bg-1 border border-gc-line/60 rounded-gc-sm py-1.5 px-2 text-sm outline-none focus:border-gc-pos"
              autoFocus
            />
            <button
              type="button"
              onClick={handleSaveEdit}
              disabled={busy}
              className="text-xs px-2.5 py-1 rounded-full bg-gc-pos text-white disabled:bg-gc-bg-3"
            >
              {busy ? <Loader2 className="animate-spin" size={12} /> : tCommon("save")}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setEditingBody(comment.body);
              }}
              disabled={busy}
              className="text-xs px-2.5 py-1 rounded-full text-gc-fg-muted hover:bg-gc-bg-3"
            >
              {tCommon("cancel")}
            </button>
          </div>
        ) : (
          <div className="mt-0.5 text-sm text-gc-fg break-words">
            <PostBody body={comment.body} coinNameMap={coinNameMap} />
          </div>
        )}

        {variant === "root" && onReplyClick && !editing && !isDeletedTombstone ? (
          <button
            type="button"
            onClick={onReplyClick}
            aria-label={t("actions.reply")}
            title={t("actions.reply")}
            className="mt-1 inline-flex items-center justify-center p-1 rounded-full text-gc-fg-muted hover:text-gc-fg hover:bg-gc-bg-3 transition"
          >
            <MessageSquare size={16} strokeWidth={1.75} />
          </button>
        ) : null}
      </div>
    </div>
  );
}
