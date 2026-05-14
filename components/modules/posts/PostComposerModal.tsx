"use client";
// components/modules/posts/PostComposerModal.tsx
//
// Wrap shadcn Dialog attorno al Composer. Margini mobile-safe (`mx-4`)
// così la dialog non si attacca ai bordi su schermi <sm. Niente
// DialogHeader visibile — il Composer integra il proprio header
// (avatar + username + visibility) per uno stile LinkedIn-blended.
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Composer } from "./Composer";

type ComposerUser = {
  id: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPublished: (postId: string) => void;
  user: ComposerUser | null;
  maxBodyLength?: number;
};

export function PostComposerModal({
  open,
  onOpenChange,
  onPublished,
  user,
  maxBodyLength,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[calc(100vw-2rem)] sm:w-full sm:max-w-[560px] p-0"
        showCloseButton
      >
        {/* DialogTitle obbligatorio per accessibility radix — visually hidden
            perché il composer mostra il proprio header utente. */}
        <DialogTitle className="sr-only">Nuovo post</DialogTitle>
        {user ? (
          <Composer
            autoFocus
            user={user}
            maxBodyLength={maxBodyLength}
            onPublished={(postId) => {
              onPublished(postId);
              onOpenChange(false);
            }}
          />
        ) : (
          <div className="p-8 text-center text-sm text-gc-fg-muted">
            Caricamento profilo…
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
