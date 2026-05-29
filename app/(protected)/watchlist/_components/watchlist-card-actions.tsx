"use client";
// Dropdown menu della WatchlistCard: edit / toggle visibility / copy
// public link / elimina. Tutto wirato alle server actions; al success
// router.refresh() forza il re-fetch del payload RSC.
//
// Sulla detail page, dopo delete navighiamo a /watchlist (la wl non
// esiste piu' → 404). Dalla lista, il push e' equivalente a refresh.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Globe,
  Link2,
  Lock,
  MoreVertical,
  Pencil,
  Trash2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  GcModal,
  GcModalContent,
  GcModalClose,
} from "@/components/ui/gc-modal";
import { Button } from "@/components/ui/button";
import {
  deleteWatchlistAction,
  toggleWatchlistVisibilityAction,
} from "@/lib/modules/watchlist/actions";
import type { WatchlistVisibility } from "@/lib/modules/watchlist/types";
import { WatchlistFormDialog } from "./watchlist-form-dialog";

type Props = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  visibility: WatchlistVisibility;
  /** Count corrente di coin nella wl — mostrato nel dialog di delete
   *  per dare contesto ("verranno rimosse anche N coin"). */
  coinsCount: number;
  /** Username dell'owner — per costruire l'URL pubblico. Null = la card
   *  non e' sotto un nome utente conosciuto (caso V1 dalla lista
   *  /watchlist: lo prendiamo dal session loggato lato client). */
  ownerUsername: string | null;
};

export function WatchlistCardActions({
  id,
  slug,
  name,
  description,
  visibility,
  coinsCount,
  ownerUsername,
}: Props) {
  const t = useTranslations("watchlist.card");
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [_, startTransition] = useTransition();

  const onToggleVisibility = () => {
    startTransition(async () => {
      const res = await toggleWatchlistVisibilityAction(id);
      if (res.ok) router.refresh();
    });
  };

  const onDelete = () => {
    startTransition(async () => {
      const res = await deleteWatchlistAction(id);
      if (res.ok) {
        setDeleteOpen(false);
        // Sulla detail page la wl appena eliminata 404erebbe → push
        // alla lista. Dalla lista, push su stessa rotta + refresh OK.
        router.push("/watchlist");
        router.refresh();
      }
    });
  };

  const onCopyLink = async () => {
    if (!ownerUsername) return;
    const url = `${window.location.origin}/w/${ownerUsername}/${slug}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard not available — silently no-op.
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={t("menu_aria")}
            className="w-8 h-8 inline-flex items-center justify-center rounded-md text-gc-fg-3 hover:bg-gc-bg-3 hover:text-gc-fg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gc-line"
          >
            <MoreVertical size={16} aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-44">
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>
            <Pencil size={14} aria-hidden />
            {t("menu_edit")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onToggleVisibility}>
            {visibility === "public" ? (
              <>
                <Lock size={14} aria-hidden />
                {t("menu_visibility_make_private")}
              </>
            ) : (
              <>
                <Globe size={14} aria-hidden />
                {t("menu_visibility_make_public")}
              </>
            )}
          </DropdownMenuItem>
          {visibility === "public" && ownerUsername ? (
            <DropdownMenuItem onSelect={onCopyLink}>
              <Link2 size={14} aria-hidden />
              {copied ? t("menu_link_copied") : t("menu_copy_link")}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            onSelect={() => setDeleteOpen(true)}
            className="text-gc-danger focus:text-gc-danger"
          >
            <Trash2 size={14} aria-hidden />
            {t("menu_delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <WatchlistFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        mode="edit"
        initialValues={{ id, name, description, visibility }}
      />

      <DeleteConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={onDelete}
        watchlistName={name}
        coinsCount={coinsCount}
      />
    </>
  );
}

function DeleteConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  watchlistName,
  coinsCount,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  watchlistName: string;
  coinsCount: number;
}) {
  const t = useTranslations("watchlist.form");
  return (
    <GcModal open={open} onOpenChange={onOpenChange}>
      <GcModalContent
        icon={Trash2}
        iconTone="danger"
        title={t("delete_title", { name: watchlistName })}
        description={
          coinsCount > 0
            ? t("delete_description_with_coins", { count: coinsCount })
            : t("delete_description_empty")
        }
        size="sm"
        footer={
          <>
            <GcModalClose asChild>
              <Button type="button" variant="ghost" size="sm">
                {t("delete_cancel")}
              </Button>
            </GcModalClose>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={onConfirm}
            >
              {t("delete_confirm")}
            </Button>
          </>
        }
      />
    </GcModal>
  );
}
