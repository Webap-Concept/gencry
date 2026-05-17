"use client";
// components/modules/posts/ReactionPopover.tsx
//
// Bottone reazione + popover delle 6 emoji.
//
// Regola (2026-05-14): 1 utente → 1 sola reaction sul post. Cliccare
// una emoji diversa SOSTITUISCE la propria precedente; cliccare la
// stessa la rimuove.
//
// Trigger: mostra le top-2 reaction types presenti sul post
// accavallate in cerchio + counter formattato (42, 999, 1k+, 12k+).
// Se 0 reaction → icona Smile neutra. La propria reaction attiva ha
// il bottone evidenziato (colore accent + ring).
//
// TODO(future): la `onShowDetails` callback opzionale aprirà una modale
// "chi ha reagito" raggruppando per emoji. Già esposta come prop per
// non rompere la firma quando arriverà.
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Smile } from "lucide-react";
import { POST_REACTION_KINDS, type PostReactionKind } from "@/lib/db/schema";
import type { PostReactionCounts } from "@/lib/modules/posts/types";
import {
  formatReactionCount,
  topReactions,
} from "@/lib/modules/posts/lib/reactions-format";

// TODO(art): sostituire emoji native con SVG custom in
// components/modules/posts/icons/ (pattern modulare).
const REACTION_EMOJI: Record<PostReactionKind, string> = {
  like: "❤️",
  rocket: "🚀",
  bull: "🐂",
  bear: "🐻",
  dump: "📉",
  diamond: "💎",
};

const HOVER_OPEN_DELAY = 200;
const HOVER_CLOSE_DELAY = 250;

type Props = {
  /** La reaction dell'utente sul post (null se non ha reagito). */
  ownReaction: PostReactionKind | null;
  /** Counter per ogni kind, usato per top-2 + total. */
  counts: PostReactionCounts;
  totalCount: number;
  /** Toggle: stessa kind → off, diversa → switch. */
  onToggle: (kind: PostReactionKind) => void;
  /** OPZIONALE: callback per future modale "chi ha reagito". */
  onShowDetails?: () => void;
};

export function ReactionPopover({
  ownReaction,
  counts,
  totalCount,
  onToggle,
  onShowDetails,
}: Props) {
  const [open, setOpen] = useState(false);
  const tReact = useTranslations("posts.reactions");
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = () => {
    if (openTimer.current) clearTimeout(openTimer.current);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    openTimer.current = null;
    closeTimer.current = null;
  };
  useEffect(() => () => clearTimers(), []);

  const scheduleOpen = () => {
    clearTimers();
    openTimer.current = setTimeout(() => setOpen(true), HOVER_OPEN_DELAY);
  };
  const scheduleClose = () => {
    clearTimers();
    closeTimer.current = setTimeout(() => setOpen(false), HOVER_CLOSE_DELAY);
  };

  const isActive = ownReaction !== null;
  const top = topReactions(counts, 2);
  const formatted = formatReactionCount(totalCount);

  const onPick = (kind: PostReactionKind) => {
    onToggle(kind);
    setOpen(false);
  };

  return (
    <div
      className="relative"
      onMouseEnter={scheduleOpen}
      onMouseLeave={scheduleClose}
      onFocus={scheduleOpen}
      onBlur={scheduleClose}
    >
      <button
        type="button"
        onClick={() => {
          // Sul desktop l'hover già lo apre; click anche per
          // tastiera/mobile. Se onShowDetails è fornito e il count>0,
          // priorità su quello (è l'azione "show who reacted"). Nota:
          // qui resta toggle del popover finché la modal details
          // non è implementata; il `if onShowDetails` è il punto in
          // cui in futuro chiameremo invece la modale.
          if (onShowDetails && totalCount > 0) {
            onShowDetails();
            return;
          }
          setOpen((prev) => !prev);
        }}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={tReact("button_aria")}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition ${
          isActive
            ? "text-gc-accent hover:bg-gc-accent/10"
            : "text-gc-fg-muted hover:bg-gc-line/40 hover:text-gc-fg"
        }`}
      >
        {top.length === 0 ? (
          <Smile size={18} strokeWidth={1.75} />
        ) : (
          <span className="flex items-center -space-x-1" aria-hidden="true">
            {top.map((kind, i) => (
              <span
                key={kind}
                style={{ zIndex: top.length - i }}
                className="w-5 h-5 flex items-center justify-center text-[14px] leading-none"
              >
                {REACTION_EMOJI[kind]}
              </span>
            ))}
          </span>
        )}
        {formatted ? <span>{formatted}</span> : null}
      </button>

      {open ? (
        <div
          role="menu"
          aria-label={tReact("menu_aria")}
          data-state="open"
          className="absolute z-50 left-0 -top-2 -translate-y-full origin-bottom-left bg-gc-modal-bg border border-gc-modal-border rounded-full shadow-xl px-1.5 py-1 flex items-center gap-0.5 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:slide-in-from-bottom-2 duration-200"
        >
          {POST_REACTION_KINDS.map((kind, i) => {
            const active = ownReaction === kind;
            return (
              <button
                key={kind}
                type="button"
                role="menuitem"
                onClick={() => onPick(kind)}
                aria-label={tReact(kind)}
                title={tReact(kind)}
                style={{ animationDelay: `${i * 30}ms` }}
                className={`text-xl leading-none w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 ease-out will-change-transform animate-in fade-in-0 slide-in-from-bottom-1 hover:-translate-y-1 hover:scale-150 hover:drop-shadow-md active:scale-95 ${
                  active
                    ? "bg-gc-accent/15 ring-2 ring-gc-accent/40"
                    : "hover:bg-gc-bg-3/60"
                }`}
              >
                {REACTION_EMOJI[kind]}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
