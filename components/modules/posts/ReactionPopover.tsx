"use client";
// components/modules/posts/ReactionPopover.tsx
//
// Bottone reazione + popover delle 6 emoji. Pattern Twitter/Instagram:
//   - desktop: hover apre il popover, mouse-leave lo chiude (con delay
//     così l'utente ha tempo di muovere il cursore sulle emoji)
//   - mobile: click apre/chiude (no hover su touch)
//
// Il bottone trigger mostra:
//   - emoji della propria reaction più recente, SE l'utente ne ha
//     almeno una sul post (UX Instagram-style)
//   - altrimenti icona generica (Smile)
// Count totale sempre a destra (somma di tutti i counter reactions_*).
//
// Niente nuove dipendenze: implementato a mano con useState +
// onMouseEnter/Leave + click. Posizione popover absolute sopra il
// trigger, container con `relative` per posizionamento corretto.
import { useEffect, useRef, useState } from "react";
import { Smile } from "lucide-react";
import { POST_REACTION_KINDS, type PostReactionKind } from "@/lib/db/schema";

const REACTION_EMOJI: Record<PostReactionKind, string> = {
  like: "❤️",
  rocket: "🚀",
  bull: "🐂",
  bear: "🐻",
  dump: "📉",
  diamond: "💎",
};

const REACTION_LABEL: Record<PostReactionKind, string> = {
  like: "Mi piace",
  rocket: "Rocket",
  bull: "Bullish",
  bear: "Bearish",
  dump: "Dump",
  diamond: "Diamond hands",
};

const HOVER_OPEN_DELAY = 200;
const HOVER_CLOSE_DELAY = 250;

type Props = {
  ownReactions: PostReactionKind[];
  totalCount: number;
  onToggle: (kind: PostReactionKind) => void;
};

export function ReactionPopover({ ownReactions, totalCount, onToggle }: Props) {
  const [open, setOpen] = useState(false);
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

  const primary = ownReactions[ownReactions.length - 1]; // ultima reaction messa
  const isActive = ownReactions.length > 0;

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
          // Tap mobile: toggle popover. Su desktop, l'hover lo apre già;
          // il click come fallback (es. da keyboard).
          setOpen((prev) => !prev);
        }}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Reazioni"
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition ${
          isActive
            ? "text-gc-accent hover:bg-gc-accent/10"
            : "text-gc-fg-muted hover:bg-gc-bg-3 hover:text-gc-fg"
        }`}
      >
        {primary ? (
          <span aria-hidden="true">{REACTION_EMOJI[primary]}</span>
        ) : (
          <Smile size={18} strokeWidth={1.75} />
        )}
        {totalCount > 0 ? <span>{totalCount}</span> : null}
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Scegli reazione"
          className="absolute z-50 left-0 -top-2 -translate-y-full bg-gc-modal-bg border border-gc-modal-border rounded-full shadow-lg px-1.5 py-1 flex items-center gap-0.5"
        >
          {POST_REACTION_KINDS.map((kind) => {
            const active = ownReactions.includes(kind);
            return (
              <button
                key={kind}
                type="button"
                role="menuitem"
                onClick={() => onPick(kind)}
                aria-label={REACTION_LABEL[kind]}
                title={REACTION_LABEL[kind]}
                className={`text-xl leading-none w-9 h-9 rounded-full flex items-center justify-center transition hover:scale-125 ${
                  active ? "bg-gc-accent/15" : "hover:bg-gc-bg-3"
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
