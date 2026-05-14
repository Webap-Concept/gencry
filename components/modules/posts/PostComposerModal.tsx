"use client";
// components/modules/posts/PostComposerModal.tsx
//
// Wrap shadcn Dialog attorno al Composer. Supporta sia create che edit
// via prop `mode`. Niente DialogHeader visibile — il Composer integra
// il proprio (avatar + username + visibility) per stile LinkedIn-blended.
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PostVisibility } from "@/lib/db/schema";
import { Composer } from "./Composer";

type ComposerUser = {
  id: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
};

type EditPayload = {
  postId: string;
  initialBody: string;
  initialVisibility: PostVisibility;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPublished: (postId: string) => void;
  user: ComposerUser | null;
  maxBodyLength?: number;
  /** Se presente, la modale è in mode EDIT su questo post. Altrimenti CREATE. */
  editPayload?: EditPayload;
};

export function PostComposerModal({
  open,
  onOpenChange,
  onPublished,
  user,
  maxBodyLength,
  editPayload,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[calc(100vw-2rem)] sm:w-full sm:max-w-[560px] p-0"
        showCloseButton
      >
        <DialogTitle className="sr-only">
          {editPayload ? "Modifica post" : "Nuovo post"}
        </DialogTitle>
        {user ? (
          <Composer
            autoFocus
            user={user}
            maxBodyLength={maxBodyLength}
            mode={
              editPayload
                ? {
                    kind: "edit",
                    postId: editPayload.postId,
                    initialBody: editPayload.initialBody,
                    initialVisibility: editPayload.initialVisibility,
                  }
                : { kind: "create" }
            }
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
