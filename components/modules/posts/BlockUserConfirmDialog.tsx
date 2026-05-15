"use client";
// components/modules/posts/BlockUserConfirmDialog.tsx
//
// Modale di conferma del blocco (mutual). Mostra le conseguenze in chiaro
// così l'utente capisce che è una decisione bi-direzionale.
//
// Il blocco effettivo viene fatto dal parent (PostCard) via Server Action
// `toggleUserBlock`. Qui solo UI + conferma user-side.
import { UserMinus } from "lucide-react";
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
  return (
    <GcModal open={isOpen} onOpenChange={onOpenChange}>
      <GcModalContent
        icon={UserMinus}
        iconTone="danger"
        title={`Bloccare ${authorDisplayName}?`}
        description="Il blocco è mutuale: non vedrete più i contenuti l'uno dell'altro."
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
              Blocca
            </Button>
          </>
        }>
        <ul className="space-y-1.5 text-sm text-gc-fg-2 list-disc pl-5">
          <li>{authorDisplayName} non comparirà più nel tuo feed o nei tuoi commenti.</li>
          <li>Non vedrai i suoi post anche se sono pubblici.</li>
          <li>Nemmeno {authorDisplayName} potrà vedere i tuoi.</li>
          <li>Puoi rimuovere il blocco in qualsiasi momento dalle impostazioni.</li>
        </ul>
      </GcModalContent>
    </GcModal>
  );
}
