"use client";
// components/modules/posts/PostComposerModal.tsx
//
// Wrap shadcn Dialog attorno al Composer. Supporta 3 mode via prop:
// create (default), edit (`editPayload`) o quote (`quoteTarget`). Niente
// DialogHeader visibile — il Composer integra il proprio (avatar +
// username + visibility) per stile LinkedIn-blended.
//
// NOTA: NON usa <GcModal> di proposito. Eccezione documentata in
// memory feedback_gc_modal_primitive: questa modale ha chrome custom
// integrato (Composer è autonomo nella sua testata/footer), quindi il
// wrapper "slot icon/title/description/footer" non si applica. Resta
// shadcn <Dialog> raw con DialogTitle sr-only solo per a11y Radix.
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PostVisibility } from "@/lib/db/schema";
import {
  Composer,
  type ComposerPublishedPayload,
  type ComposerQuoteTarget,
} from "./Composer";

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
  /**
   * `edited` è popolato solo in mode EDIT (con i nuovi body/visibility),
   * permette al parent di fare optimistic display update senza refetch.
   */
  onPublished: (postId: string, edited?: ComposerPublishedPayload) => void;
  user: ComposerUser | null;
  maxBodyLength?: number;
  /** Se presente → mode EDIT. Mutuamente esclusivo con quoteTarget. */
  editPayload?: EditPayload;
  /** Se presente → mode QUOTE. Mutuamente esclusivo con editPayload. */
  quoteTarget?: ComposerQuoteTarget;
  /** Sticky default in mode create/quote; in edit è ignorato. */
  initialDefaultVisibility?: PostVisibility;
};

export function PostComposerModal({
  open,
  onOpenChange,
  onPublished,
  user,
  maxBodyLength,
  editPayload,
  quoteTarget,
  initialDefaultVisibility,
}: Props) {
  const tComp = useTranslations("posts.composer");
  const title = editPayload
    ? tComp("modal_title_edit")
    : quoteTarget
      ? tComp("modal_title_quote")
      : tComp("modal_title_new");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[calc(100vw-2rem)] sm:w-full sm:max-w-[560px] p-0"
        showCloseButton
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        {user ? (
          <Composer
            autoFocus
            user={user}
            maxBodyLength={maxBodyLength}
            initialDefaultVisibility={initialDefaultVisibility}
            mode={
              editPayload
                ? {
                    kind: "edit",
                    postId: editPayload.postId,
                    initialBody: editPayload.initialBody,
                    initialVisibility: editPayload.initialVisibility,
                  }
                : quoteTarget
                  ? { kind: "quote", target: quoteTarget }
                  : { kind: "create" }
            }
            onPublished={(postId, edited) => {
              onPublished(postId, edited);
              onOpenChange(false);
            }}
          />
        ) : (
          <div className="p-8 text-center text-sm text-gc-fg-muted">
            {tComp("loading_profile")}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
