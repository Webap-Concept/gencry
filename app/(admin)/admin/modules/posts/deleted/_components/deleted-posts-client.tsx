"use client";
// app/(admin)/admin/modules/posts/deleted/_components/deleted-posts-client.tsx
//
// Lista admin dei post soft-deleted con bottone "Ripristina" per quelli
// in grace. I post oltre grace appaiono marcati come "non più
// ripristinabili" — il cron li rimuoverà alla prossima esecuzione.

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AdminDialog,
  AdminDialogCancelButton,
  AdminDialogConfirmButton,
  AdminDialogContent,
} from "@/app/(admin)/admin/_components/admin-dialog";
import {
  Inbox,
  Loader2,
  RotateCcw,
  ShieldAlert,
  Trash2,
  UserX,
} from "lucide-react";
import type {
  DeletedPostRow,
  DeletedPostsFilter,
  DeletedPostsPage,
} from "@/lib/modules/posts/queries";
import { loadMoreDeletedAction, restorePostAction } from "../actions";

const FILTER_TABS: { key: DeletedPostsFilter; label: string }[] = [
  { key: "all", label: "Tutti" },
  { key: "author", label: "Da autori" },
  { key: "moderator", label: "Da moderatori" },
];

function moderatorDisplay(
  mod: NonNullable<
    Extract<DeletedPostRow["deletedBy"], { kind: "moderator" }>["moderator"]
  >,
): string {
  if (mod.username) return `@${mod.username}`;
  const full = [mod.firstName, mod.lastName].filter(Boolean).join(" ");
  return full || mod.id.slice(0, 8);
}

function formatRelativeTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diffMs = Date.now() - d.getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return "ora";
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86_400) return `${Math.floor(sec / 3600)}h`;
  if (sec < 604_800) return `${Math.floor(sec / 86_400)}g`;
  return d.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
}

function authorDisplay(author: DeletedPostRow["author"]): string {
  if (author.username) return `@${author.username}`;
  const full = [author.firstName, author.lastName].filter(Boolean).join(" ");
  return full || "Utente";
}

function bodyExcerpt(body: string): string {
  const collapsed = body.replace(/\s+/g, " ").trim();
  return collapsed.length <= 180 ? collapsed : collapsed.slice(0, 177) + "…";
}

export function DeletedPostsClient({
  initial,
  graceDays,
  filter,
}: {
  initial: DeletedPostsPage;
  graceDays: number;
  filter: DeletedPostsFilter;
}) {
  const router = useRouter();
  const [confirmTarget, setConfirmTarget] = useState<DeletedPostRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Append-paginazione client-side. Reset implicito via key page (cambio
  // filter ricarica la rotta server, ricomincia da capo).
  const [rows, setRows] = useState<DeletedPostRow[]>(initial.rows);
  const [cursor, setCursor] = useState<string | null>(initial.nextCursor);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [isLoadingMore, startLoadMore] = useTransition();

  const loadMore = () => {
    if (!cursor) return;
    setLoadMoreError(null);
    const cur = cursor;
    startLoadMore(async () => {
      const res = await loadMoreDeletedAction({ filter, cursor: cur });
      if (!res.ok) {
        setLoadMoreError(res.error);
        return;
      }
      setRows((prev) => [...prev, ...res.rows]);
      setCursor(res.nextCursor);
    });
  };

  const onConfirm = () => {
    if (!confirmTarget) return;
    setError(null);
    const target = confirmTarget;
    startTransition(async () => {
      const res = await restorePostAction({ postId: target.id });
      if (!res.ok) {
        setError(
          res.error === "post_not_in_grace"
            ? "Il post è oltre il grace period: non più ripristinabile."
            : res.error,
        );
        return;
      }
      setConfirmTarget(null);
      router.refresh();
    });
  };

  const filterPills = (
    <div
      className="flex flex-wrap items-center gap-1 p-1 rounded-xl w-fit"
      style={{ background: "var(--admin-hover-bg)" }}>
      {FILTER_TABS.map((tab) => {
        const isActive = tab.key === filter;
        return (
          <Link
            key={tab.key}
            href={tab.key === "all" ? "?" : `?filter=${tab.key}`}
            className="px-4 py-1.5 text-sm rounded-lg font-medium transition-all"
            style={{
              background: isActive ? "var(--admin-accent)" : "transparent",
              color: isActive ? "#fff" : "var(--admin-text-muted)",
            }}>
            {tab.label}
          </Link>
        );
      })}
    </div>
  );

  if (rows.length === 0) {
    return (
      <div className="space-y-4">
        {filterPills}
        <div
          className="rounded-lg p-8 text-center"
          style={{
            background: "var(--admin-card-bg)",
            border: "1px solid var(--admin-card-border)",
          }}>
          <Inbox
            size={32}
            className="mx-auto mb-3"
            style={{ color: "var(--admin-text-faint)" }}
            aria-hidden
          />
          <p
            className="text-sm font-medium"
            style={{ color: "var(--admin-text)" }}>
            Nessun post eliminato in attesa.
          </p>
          <p
            className="text-xs mt-1"
            style={{ color: "var(--admin-text-faint)" }}>
            Quando un utente cancella un suo post, compare qui per {graceDays}{" "}
            giorni prima del cleanup definitivo.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      {filterPills}
      <div className="space-y-2 mt-4" data-deleted-list>
        {rows.map((row) => (
          <div
            key={row.id}
            className="rounded-lg p-4"
            style={{
              background: "var(--admin-card-bg)",
              border: "1px solid var(--admin-card-border)",
            }}>
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Link
                    href={`/admin/access/users/${row.author.id}`}
                    className="text-sm font-medium hover:underline"
                    style={{ color: "var(--admin-text)" }}>
                    {authorDisplay(row.author)}
                  </Link>
                  <span
                    className="text-xs"
                    style={{ color: "var(--admin-text-faint)" }}>
                    · creato {formatRelativeTime(row.createdAt)} · eliminato{" "}
                    {formatRelativeTime(row.deletedAt)}
                  </span>
                  <DeletedByBadge deletedBy={row.deletedBy} />
                  {row.outOfGrace ? (
                    <span
                      className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wide"
                      style={{
                        background:
                          "color-mix(in srgb, var(--gc-neg) 14%, transparent)",
                        color: "var(--gc-neg)",
                      }}>
                      Oltre grace
                    </span>
                  ) : null}
                </div>
                <p
                  className="text-sm mt-2"
                  style={{ color: "var(--admin-text-muted)" }}>
                  {bodyExcerpt(row.body)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setConfirmTarget(row)}
                disabled={row.outOfGrace || isPending}
                className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: "var(--admin-accent)",
                  color: "white",
                }}>
                <RotateCcw size={13} strokeWidth={1.75} aria-hidden />
                Ripristina
              </button>
            </div>
          </div>
        ))}
      </div>

      {cursor ? (
        <div className="flex flex-col items-center gap-1.5 pt-2">
          <button
            type="button"
            onClick={loadMore}
            disabled={isLoadingMore}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            style={{
              background: "var(--admin-card-bg)",
              color: "var(--admin-text)",
              border: "1px solid var(--admin-card-border)",
            }}>
            {isLoadingMore ? (
              <Loader2 size={14} className="animate-spin" aria-hidden />
            ) : null}
            {isLoadingMore ? "Caricamento…" : "Carica altre"}
          </button>
          {loadMoreError ? (
            <p className="text-xs" style={{ color: "var(--gc-neg, #dc2626)" }}>
              {loadMoreError}
            </p>
          ) : null}
        </div>
      ) : null}

      <AdminDialog
        open={!!confirmTarget}
        onOpenChange={(o) => {
          if (!o) {
            setConfirmTarget(null);
            setError(null);
          }
        }}>
        <AdminDialogContent
          icon={RotateCcw}
          size="md"
          title="Ripristinare il post?"
          description="Tornerà visibile in tutti i feed e nella pagina del singolo post."
          footer={
            <>
              <AdminDialogCancelButton
                onClick={() => {
                  setConfirmTarget(null);
                  setError(null);
                }}
                disabled={isPending}>
                Annulla
              </AdminDialogCancelButton>
              <AdminDialogConfirmButton
                onClick={onConfirm}
                loading={isPending}
                icon={RotateCcw}>
                Ripristina
              </AdminDialogConfirmButton>
            </>
          }>
          <div className="space-y-2">
            <p
              className="text-sm"
              style={{ color: "var(--admin-text-muted)" }}>
              Autore: <strong>{confirmTarget && authorDisplay(confirmTarget.author)}</strong>
            </p>
            {confirmTarget ? (
              <p
                className="text-sm italic"
                style={{ color: "var(--admin-text-faint)" }}>
                &laquo;{bodyExcerpt(confirmTarget.body)}&raquo;
              </p>
            ) : null}
            {error ? (
              <p
                className="text-xs font-medium"
                style={{ color: "var(--gc-neg)" }}>
                {error}
              </p>
            ) : null}
          </div>
        </AdminDialogContent>
      </AdminDialog>
    </>
  );
}

/**
 * Badge che riassume chi ha cancellato il post (autore vs moderatore).
 * Per moderatori risolvibili linka al profilo admin; per moderatori
 * "orfani" (account cancellato) mostra fallback.
 */
function DeletedByBadge({ deletedBy }: { deletedBy: DeletedPostRow["deletedBy"] }) {
  if (deletedBy.kind === "author") {
    return (
      <span
        className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wide"
        style={{
          background:
            "color-mix(in srgb, var(--admin-text-muted) 14%, transparent)",
          color: "var(--admin-text-muted)",
        }}>
        <UserX size={10} strokeWidth={2} aria-hidden />
        Da autore
      </span>
    );
  }
  if (deletedBy.kind === "moderator") {
    const baseClass =
      "inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wide";
    const baseStyle = {
      background: "color-mix(in srgb, #b45309 14%, transparent)",
      color: "#b45309",
    } as const;
    if (deletedBy.moderator) {
      return (
        <Link
          href={`/admin/access/users/${deletedBy.moderator.id}`}
          className={`${baseClass} hover:underline`}
          style={baseStyle}>
          <ShieldAlert size={10} strokeWidth={2} aria-hidden />
          Da {moderatorDisplay(deletedBy.moderator)}
        </Link>
      );
    }
    return (
      <span className={baseClass} style={baseStyle}>
        <ShieldAlert size={10} strokeWidth={2} aria-hidden />
        Da moderatore (account rimosso)
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wide"
      style={{
        background: "color-mix(in srgb, var(--admin-text-faint) 14%, transparent)",
        color: "var(--admin-text-faint)",
      }}>
      Origine sconosciuta
    </span>
  );
}
