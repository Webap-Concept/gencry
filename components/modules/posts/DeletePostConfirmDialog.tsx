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
  return (
    <GcModal open={isOpen} onOpenChange={onOpenChange}>
      <GcModalContent
        icon={Trash2}
        iconTone="danger"
        title="Eliminare questo post?"
        description="Il post sparisce subito dal tuo profilo e dai feed di tutti."
        size="md"
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}>
              Annulla
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={onConfirm}>
              Elimina
            </Button>
          </>
        }>
        <ul className="space-y-1.5 text-sm text-gc-fg-2 list-disc pl-5">
          <li>Reazioni e bookmark restano associati al post fino al ripristino.</li>
          <li>I commenti restano se qualcuno ha già risposto (etichetta &laquo;post rimosso&raquo;), altrimenti spariscono.</li>
          <li>I quote-repost di altri utenti mostrano &laquo;post originale rimosso&raquo;.</li>
          <li>Per <strong>7 giorni</strong> un moderatore può ripristinarlo. Dopo, il post viene eliminato definitivamente.</li>
        </ul>
      </GcModalContent>
    </GcModal>
  );
}
