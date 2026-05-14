"use client";
// components/modules/posts/Composer.tsx
//
// Form per la creazione di un post — design LinkedIn-style: textarea
// che si blenda con la modale (no border, no bg differente), header
// con avatar utente + username + visibility selector come dropdown
// inline. Il parent owns il post-success (toast, close).
import { useCallback, useState, useTransition } from "react";
import { Globe, Lock, UserCheck, Users } from "lucide-react";
import { createPost } from "@/lib/modules/posts/actions";
import { POST_VISIBILITIES, type PostVisibility } from "@/lib/db/schema";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MediaUploader } from "./MediaUploader";

type ComposerUser = {
  id: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
};

const VISIBILITY_META: Record<
  PostVisibility,
  { label: string; description: string; Icon: typeof Globe }
> = {
  public:    { label: "Pubblico",       description: "Tutti possono vedere",       Icon: Globe },
  members:   { label: "Community",      description: "Solo utenti loggati",         Icon: Users },
  followers: { label: "Chi mi segue",   description: "Solo i tuoi follower",        Icon: UserCheck },
  private:   { label: "Solo io",        description: "Visibile solo a te",          Icon: Lock },
};

function displayHandle(user: ComposerUser): string {
  if (user.username) return `@${user.username}`;
  const full = [user.firstName, user.lastName].filter(Boolean).join(" ");
  return full || "Utente";
}

function initials(user: ComposerUser): string {
  const f = (user.firstName ?? user.username ?? "?")[0] ?? "?";
  return f.toUpperCase();
}

type Props = {
  user: ComposerUser;
  maxBodyLength?: number;
  onPublished?: (postId: string) => void;
  autoFocus?: boolean;
};

export function Composer({ user, maxBodyLength = 2000, onPublished, autoFocus }: Props) {
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<PostVisibility>("public");
  const [mediaIds, setMediaIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // useCallback per non triggherare useEffect del MediaUploader ad ogni render.
  const onMediaIdsChange = useCallback((ids: string[]) => setMediaIds(ids), []);

  const remaining = maxBodyLength - body.length;
  const trimmedLen = body.trim().length;
  // Permettiamo il submit anche con body vuoto SE c'è almeno un media:
  // un post "solo immagini" è valido (Instagram-style). Per ora però il
  // server CHECK posts_body_len_chk vuole body NOT NULL, default '' è ok
  // ma validateBody nel server lancia su empty. Lascio la regola "almeno
  // 1 char di testo" finché PR-6c non rilassiamo il vincolo.
  const canSubmit = trimmedLen > 0 && remaining >= 0 && !isPending;

  const submit = () => {
    if (!canSubmit) return;
    setError(null);
    startTransition(async () => {
      const res = await createPost({ body, visibility, mediaIds });
      if (res.ok) {
        setBody("");
        setVisibility("public");
        setMediaIds([]);
        onPublished?.(res.data!.postId);
      } else {
        setError(res.error);
      }
    });
  };

  const ActiveIcon = VISIBILITY_META[visibility].Icon;

  return (
    <div className="flex flex-col">
      {/* Header utente — l'INTERO blocco (avatar + username + stato)
          è il trigger della dropdown visibility. Niente pill bottone
          attorno allo stato: solo icona+testo come label inline. */}
      <div className="px-5 pt-5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Cambia visibilità"
              className="flex items-start gap-3 rounded-lg -m-1 p-1 hover:bg-gc-bg-3/60 transition text-left"
            >
              {user.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.avatarUrl}
                  alt=""
                  className="w-11 h-11 rounded-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="w-11 h-11 rounded-full bg-gc-line flex items-center justify-center text-sm font-medium text-gc-fg-muted">
                  {initials(user)}
                </div>
              )}
              <div className="flex flex-col gap-1 min-w-0">
                <span className="font-medium text-gc-fg leading-none">
                  {displayHandle(user)}
                </span>
                <div className="flex items-center gap-1.5 text-xs text-gc-fg-muted">
                  <ActiveIcon size={12} strokeWidth={2} />
                  <span>{VISIBILITY_META[visibility].label}</span>
                </div>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="min-w-[240px] bg-gc-modal-bg border-gc-modal-border text-gc-fg"
          >
            {POST_VISIBILITIES.map((v) => {
              const meta = VISIBILITY_META[v];
              const Icon = meta.Icon;
              const active = v === visibility;
              return (
                <DropdownMenuItem
                  key={v}
                  onSelect={() => setVisibility(v)}
                  className={`flex items-start gap-2.5 py-2 ${
                    active ? "bg-gc-bg-3" : ""
                  }`}
                >
                  <Icon size={16} strokeWidth={1.75} className="mt-0.5" />
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm">{meta.label}</span>
                    <span className="text-xs text-gc-fg-muted">
                      {meta.description}
                    </span>
                  </div>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Textarea blended: stesso bg della modale, no border, padding identico ai bordi */}
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Cosa pensi del mercato?"
        rows={6}
        maxLength={maxBodyLength + 100}
        className="w-full bg-transparent text-gc-fg placeholder:text-gc-fg-muted/70 outline-none border-0 resize-none text-[17px] leading-relaxed px-5 py-4"
        aria-label="Testo del post"
        disabled={isPending}
        autoFocus={autoFocus}
      />

      {/* Media uploader: drag&drop + thumb preview */}
      <MediaUploader onMediaIdsChange={onMediaIdsChange} disabled={isPending} />

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
          className="px-5 py-1.5 rounded-full bg-gc-accent text-gc-bg-1 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isPending ? "Pubblico…" : "Pubblica"}
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
