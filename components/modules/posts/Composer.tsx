"use client";
// components/modules/posts/Composer.tsx
//
// Form per la creazione O modifica O quote-repost di un post. Design
// LinkedIn-style: textarea che si blenda con la modale (no border,
// no bg differente), header con avatar utente + username +
// visibility dropdown inline.
//
// Mode `create`: body/visibility partono vuoti, submit → createPost,
//                visibility cambiabile liberamente, onPublished riceve
//                il nuovo postId.
// Mode `edit`:   body/visibility pre-popolati, submit → editPost,
//                visibility cambiabile SOLO verso più restrittivo
//                (regola server), onPublished riceve il postId esistente.
// Mode `quote`:  body/visibility partono vuoti (visibility = sticky pref),
//                submit → createQuoteRepost, embed preview del target
//                sotto la textarea, niente MediaUploader.
//
// Il parent (PostComposerModal) owns il post-success (toast, close).
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Globe, Lock, Repeat2, UserCheck, Users } from "lucide-react";
import {
  createPost,
  createQuoteRepost,
  editPost,
} from "@/lib/modules/posts/actions";
import { POST_VISIBILITIES, type PostVisibility } from "@/lib/db/schema";
import type { PostAuthorPublic } from "@/lib/modules/posts/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePostsError } from "@/lib/modules/posts/lib/use-posts-error";
import { UserAvatar } from "@/components/ui/user-avatar";
import { MediaUploader } from "./MediaUploader";

type ComposerUser = {
  id: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
};

// Solo Icon mapping: label/description vivono in posts.json sotto
// `visibility.<kind>_label/_description` e vengono risolte runtime.
const VISIBILITY_ICON: Record<PostVisibility, typeof Globe> = {
  public:    Globe,
  members:   Users,
  followers: UserCheck,
  private:   Lock,
};

// Ordine di restrizione (più alto = più restrittivo). Edit può solo
// aumentare la restrizione (regola server enforced).
const VISIBILITY_RANK: Record<PostVisibility, number> = {
  public: 0,
  members: 1,
  followers: 2,
  private: 3,
};

function displayHandle(user: ComposerUser, fallback: string): string {
  if (user.username) return `@${user.username}`;
  const full = [user.firstName, user.lastName].filter(Boolean).join(" ");
  return full || fallback;
}

type CreateMode = { kind: "create" };
type EditMode = {
  kind: "edit";
  postId: string;
  initialBody: string;
  initialVisibility: PostVisibility;
};
/** Quote target rendered come embed preview sotto la textarea. */
export type ComposerQuoteTarget = {
  id: string;
  body: string;
  author: PostAuthorPublic;
};
type QuoteMode = {
  kind: "quote";
  target: ComposerQuoteTarget;
};

/**
 * Su create il secondo arg è omesso. Su edit contiene i nuovi
 * valori così il parent può fare optimistic-display update senza
 * un refetch del post.
 */
export type ComposerPublishedPayload = {
  body: string;
  visibility: PostVisibility;
};

type Props = {
  user: ComposerUser;
  maxBodyLength?: number;
  onPublished?: (postId: string, edited?: ComposerPublishedPayload) => void;
  autoFocus?: boolean;
  mode?: CreateMode | EditMode | QuoteMode;
  /** Default visibility in mode create/quote (sticky preference letta dal
   *  parent). Ignorato in mode edit (lì la visibility iniziale è quella
   *  del post). */
  initialDefaultVisibility?: PostVisibility;
};

export function Composer({
  user,
  maxBodyLength = 2000,
  onPublished,
  autoFocus,
  mode = { kind: "create" },
  initialDefaultVisibility,
}: Props) {
  const isEdit = mode.kind === "edit";
  const isQuote = mode.kind === "quote";
  const createDefault = initialDefaultVisibility ?? "public";
  const [body, setBody] = useState(isEdit ? mode.initialBody : "");
  const [visibility, setVisibility] = useState<PostVisibility>(
    isEdit ? mode.initialVisibility : createDefault,
  );
  const [mediaIds, setMediaIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const tErr = usePostsError();
  const t = useTranslations("posts");
  const tComp = useTranslations("posts.composer");
  const tVis = useTranslations("posts.visibility");
  const userFallback = t("common.user_fallback");

  const remaining = maxBodyLength - body.length;
  const trimmedLen = body.trim().length;
  const canSubmit = trimmedLen > 0 && remaining >= 0 && !isPending;

  const submit = () => {
    if (!canSubmit) return;
    setError(null);
    startTransition(async () => {
      if (mode.kind === "edit") {
        const res = await editPost({
          postId: mode.postId,
          body,
          visibility,
        });
        if (res.ok) {
          onPublished?.(mode.postId, { body, visibility });
        } else {
          setError(tErr(res.error, res));
        }
      } else if (mode.kind === "quote") {
        const res = await createQuoteRepost({
          repostOfId: mode.target.id,
          body,
          visibility,
        });
        if (res.ok) {
          setBody("");
          setVisibility(visibility);
          onPublished?.(res.data!.postId);
        } else {
          setError(tErr(res.error, res));
        }
      } else {
        const res = await createPost({ body, visibility, mediaIds });
        if (res.ok) {
          setBody("");
          // Reset alla preferenza appena salvata server-side (sticky):
          // l'utente vede il prossimo composer già impostato sull'ultima scelta.
          setVisibility(visibility);
          setMediaIds([]);
          onPublished?.(res.data!.postId);
        } else {
          setError(tErr(res.error, res));
        }
      }
    });
  };

  const ActiveIcon = VISIBILITY_ICON[visibility];

  // In edit mode, le visibility "più permissive" della current sono
  // disabilitate (il server le rifiuterebbe). Calcoliamo client-side
  // per UX coerente.
  const editLockRank = isEdit ? VISIBILITY_RANK[mode.initialVisibility] : 0;

  return (
    <div className="flex flex-col">
      {/* Header utente — l'INTERO blocco è il trigger della dropdown. */}
      <div className="px-5 pt-5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={tComp("change_visibility")}
              className="flex items-start gap-3 rounded-lg -m-1 p-1 hover:bg-gc-bg-3/60 transition text-left"
            >
              <UserAvatar user={user} size={44} />
              <div className="flex flex-col gap-1 min-w-0">
                <span className="font-medium text-gc-fg leading-none">
                  {displayHandle(user, userFallback)}
                </span>
                <div className="flex items-center gap-1.5 text-xs text-gc-fg-muted">
                  <ActiveIcon size={12} strokeWidth={2} />
                  <span>{tVis(`${visibility}_label`)}</span>
                </div>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="min-w-[240px] bg-gc-modal-bg border-gc-modal-border text-gc-fg"
          >
            {POST_VISIBILITIES.map((v) => {
              const Icon = VISIBILITY_ICON[v];
              const active = v === visibility;
              const lockedByEdit =
                isEdit && VISIBILITY_RANK[v] < editLockRank;
              return (
                <DropdownMenuItem
                  key={v}
                  disabled={lockedByEdit}
                  onSelect={() => {
                    if (!lockedByEdit) setVisibility(v);
                  }}
                  className={`flex items-start gap-2.5 py-2 ${
                    active ? "bg-gc-bg-3" : ""
                  } ${lockedByEdit ? "opacity-40 cursor-not-allowed" : ""}`}
                >
                  <Icon size={16} strokeWidth={1.75} className="mt-0.5" />
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm">{tVis(`${v}_label`)}</span>
                    <span className="text-xs text-gc-fg-muted">
                      {lockedByEdit
                        ? tComp("visibility_locked")
                        : tVis(`${v}_description`)}
                    </span>
                  </div>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Textarea blended */}
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={
          isQuote ? tComp("quote_placeholder") : tComp("textarea_placeholder")
        }
        rows={isQuote ? 4 : 6}
        maxLength={maxBodyLength + 100}
        className="w-full bg-transparent text-gc-fg placeholder:text-gc-fg-muted/70 outline-none border-0 resize-none text-[17px] leading-relaxed px-5 py-4"
        aria-label={tComp("textarea_aria")}
        disabled={isPending}
        autoFocus={autoFocus}
      />

      {/* Quote embed preview: solo testo (plain), niente ticker links —
          è una preview di contesto, non un widget interattivo. Il body è
          troncato visivamente via line-clamp per non far esplodere la modale
          su post lunghi. */}
      {mode.kind === "quote" ? (
        <div className="mx-5 mb-3 border border-gc-line/60 rounded-gc-sm p-3 bg-gc-bg-1">
          <div className="flex items-center gap-1.5 text-xs text-gc-fg-muted mb-1">
            <Repeat2 size={12} strokeWidth={1.75} aria-hidden />
            <span className="font-medium">
              {mode.target.author.username
                ? `@${mode.target.author.username}`
                : [
                    mode.target.author.firstName,
                    mode.target.author.lastName,
                  ]
                    .filter(Boolean)
                    .join(" ") || userFallback}
            </span>
          </div>
          <p className="text-sm text-gc-fg/90 whitespace-pre-wrap line-clamp-5">
            {mode.target.body}
          </p>
        </div>
      ) : null}

      {/* MediaUploader solo in mode create. Edit: "no edit immagini".
          Quote: niente media (v1) — un quote è "testo + post citato". */}
      {mode.kind === "create" ? (
        <MediaUploader onMediaIdsChange={setMediaIds} disabled={isPending} />
      ) : null}

      {/* Footer: counter + submit */}
      <div className="flex items-center gap-3 px-5 pb-4">
        <span
          className={`text-xs ${remaining < 0 ? "text-gc-danger" : "text-gc-fg-muted"}`}
        >
          {remaining}
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="px-5 py-1.5 rounded-full bg-gc-accent text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isPending
            ? isEdit
              ? tComp("submitting_edit")
              : isQuote
                ? tComp("submitting_quote")
                : tComp("submitting_new")
            : isEdit
              ? tComp("submit_edit")
              : isQuote
                ? tComp("submit_quote")
                : tComp("submit_new")}
        </button>
      </div>

      {error ? (
        <p className="px-5 pb-4 text-xs text-gc-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
