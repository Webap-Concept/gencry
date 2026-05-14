"use client";
// components/modules/posts/PostComposerModal.tsx
//
// Wrap shadcn Dialog attorno al Composer. Trigger esterno via prop
// `open`/`onOpenChange` così il parent può controllare l'apertura (es.
// pulsante sidebar/FAB).
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Composer } from "./Composer";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPublished: (postId: string) => void;
  maxBodyLength?: number;
};

export function PostComposerModal({
  open,
  onOpenChange,
  onPublished,
  maxBodyLength,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Nuovo post</DialogTitle>
        </DialogHeader>
        <Composer
          autoFocus
          maxBodyLength={maxBodyLength}
          onPublished={(postId) => {
            onPublished(postId);
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
