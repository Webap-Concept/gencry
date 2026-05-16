"use client";
// components/modules/posts/BlockUserConfirmDialog.tsx
//
// Modale di conferma del blocco (mutual). Mostra le conseguenze in chiaro
// così l'utente capisce che è una decisione bi-direzionale.
//
// Il blocco effettivo viene fatto dal parent (PostCard) via Server Action
// `toggleUserBlock`. Qui solo UI + conferma user-side.
import { UserMinus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { GcModal, GcModalContent } from "@/components/ui/gc-modal";

type Props = {
  /** Display name dell'autore (es. "@mariotest"). */
  authorDisplayName: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

export function BlockUserConfirmDialog({
  authorDisplayName,
  isOpen,
  onOpenChange,
  onConfirm,
}: Props) {
  const t = useTranslations("posts");
  const tBlock = useTranslations("posts.dialogs.block");
  return (
    <GcModal open={isOpen} onOpenChange={onOpenChange}>
      <GcModalContent
        icon={UserMinus}
        iconTone="danger"
        title={tBlock("title", { name: authorDisplayName })}
        description={tBlock("description")}
        size="md"
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={onConfirm}>
              {tBlock("confirm")}
            </Button>
          </>
        }>
        <ul className="space-y-1.5 text-sm text-gc-fg-2 list-disc pl-5">
          <li>{tBlock("consequence_1", { name: authorDisplayName })}</li>
          <li>{tBlock("consequence_2")}</li>
          <li>{tBlock("consequence_3", { name: authorDisplayName })}</li>
          <li>{tBlock("consequence_4")}</li>
        </ul>
      </GcModalContent>
    </GcModal>
  );
}
