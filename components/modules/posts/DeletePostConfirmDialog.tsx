"use client";
// components/modules/posts/DeletePostConfirmDialog.tsx
//
// Modale di conferma soft-delete del post. Sostituisce il vecchio
// window.confirm() — UX coerente col resto del modulo (GcModal tone
// danger come il BlockUserConfirmDialog) e blocca il click accidentale
// con un'azione esplicita.
//
// L'azione di delete vera la esegue il parent (PostCard) via Server
// Action `softDeletePost`. Qui solo UI + conferma.
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { GcModal, GcModalContent } from "@/components/ui/gc-modal";

type Props = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

export function DeletePostConfirmDialog({
  isOpen,
  onOpenChange,
  onConfirm,
}: Props) {
  const t = useTranslations("posts");
  const tDel = useTranslations("posts.dialogs.delete");
  return (
    <GcModal open={isOpen} onOpenChange={onOpenChange}>
      <GcModalContent
        icon={Trash2}
        iconTone="danger"
        title={tDel("title")}
        description={tDel("description")}
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
              {tDel("confirm")}
            </Button>
          </>
        }>
        <ul className="space-y-1.5 text-sm text-gc-fg-2 list-disc pl-5">
          <li>{tDel("consequence_1")}</li>
          <li>{tDel("consequence_2")}</li>
          <li>{tDel("consequence_3")}</li>
          <li>
            {tDel("consequence_4_prefix")}
            <strong>{tDel("consequence_4_strong")}</strong>
            {tDel("consequence_4_suffix")}
          </li>
        </ul>
      </GcModalContent>
    </GcModal>
  );
}
