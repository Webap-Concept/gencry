"use client";
// Dropdown menu della WatchlistCard: edit / toggle visibility / copy
// public link / archive. Tutto wirato alle server actions; al success
// Next revalida la pagina via revalidatePath nelle actions.
//
// Copy link: usa navigator.clipboard se disponibile, fallback no-op
// (con piccola label di stato "Copiato" via toast inline).

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
  archiveWatchlistAction,
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
  ownerUsername,
}: Props) {
  const t = useTranslations("watchlist.card");
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [_, startTransition] = useTransition();

  const onToggleVisibility = () => {
    startTransition(async () => {
      const res = await toggleWatchlistVisibilityAction(id);
      if (res.ok) router.refresh();
    });
  };

  const onArchive = () => {
    startTransition(async () => {
      const res = await archiveWatchlistAction(id);
      if (res.ok) {
        setArchiveOpen(false);
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
            onSelect={() => setArchiveOpen(true)}
            className="text-gc-danger focus:text-gc-danger"
          >
            <Trash2 size={14} aria-hidden />
            {t("menu_archive")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <WatchlistFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        mode="edit"
        initialValues={{ id, name, description, visibility }}
      />

      <ArchiveConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        onConfirm={onArchive}
      />
    </>
  );
}

function ArchiveConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const t = useTranslations("watchlist.form");
  return (
    <GcModal open={open} onOpenChange={onOpenChange}>
      <GcModalContent
        icon={Trash2}
        iconTone="danger"
        title={t("delete_title")}
        description={t("delete_description")}
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
