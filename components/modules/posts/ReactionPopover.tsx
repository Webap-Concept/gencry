"use client";
// components/modules/posts/ReactionPopover.tsx
//
// Bottone reazione + popover delle 5 emoji (refactor M_posts_008).
//
// Set finale: like (💎) | bullish (🐂) | bearish (🐻) | to_the_moon (🚀) | dump (📉).
//
// Comportamento (Facebook-like):
//   - CLICK sul trigger      → quick action immediata: se viewer non ha
//                              reagito → add "like"; se ha reagito → remove.
//                              NIENTE popover (per chi vuole semplicemente
//                              mettere/togliere like al volo).
//   - HOVER prolungato (200ms) sul trigger → apre la popover per scegliere
//                              tra tutte e 5 le reactions. Su mobile è
//                              inaccessibile via tap → forniamo anche un
//                              long-press fallback (TODO: future).
//
// Animazione (LinkedIn-style smooth):
//   - cascade entrance ridotta a 15ms/icon (75ms totali su 5 elementi)
//   - hover scale-125 + translate-y-2 (più gentile di scale-150)
//   - transition-transform invece di transition-all (1 prop GPU-composited)
//   - tooltip label sopra l'icona on hover/focus (peer-hover pattern,
//     pointer-events-none per non interferire col click)
//
// Riusabile su post E commenti (`compact` prop riduce padding/font).
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { POST_REACTION_KINDS, type PostReactionKind } from "@/lib/db/schema";
import type { PostReactionCounts } from "@/lib/modules/posts/types";
import {
  formatReactionCount,
  topReactions,
} from "@/lib/modules/posts/lib/reactions-format";

// TODO(art): sostituire emoji native con SVG custom in
// components/modules/posts/icons/ (pattern modulare).
const REACTION_EMOJI: Record<PostReactionKind, string> = {
  like: "💎",
  bullish: "🐂",
  bearish: "🐻",
  to_the_moon: "🚀",
  dump: "📉",
};

/** Reaction "default" del bottone trigger quando count=0 e viewer non
 *  ha reagito. Click immediato = applica questa. Coerente col fatto
 *  che `like` ha icona diamante: è il "mi piace" classico. */
const DEFAULT_REACTION: PostReactionKind = "like";

const HOVER_OPEN_DELAY = 200;
const HOVER_CLOSE_DELAY = 250;

type Props = {
  /** La reaction dell'utente sul target (null se non ha reagito). */
  ownReaction: PostReactionKind | null;
  /** Counter per ogni kind, usato per top-2 + total. */
  counts: PostReactionCounts;
  totalCount: number;
  /** Toggle: stessa kind → off, diversa → switch. */
  onToggle: (kind: PostReactionKind) => void;
  /** OPZIONALE: callback per future modale "chi ha reagito". */
  onShowDetails?: () => void;
  /** Render compatto per i commenti: padding/font ridotti. Default false. */
  compact?: boolean;
};

export function ReactionPopover({
  ownReaction,
  counts,
  totalCount,
  onToggle,
  onShowDetails: _onShowDetails,
  compact = false,
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

  // Click trigger: quick-like / remove. La popover NON si apre via click,
  // solo via hover prolungato (`HOVER_OPEN_DELAY`). Annulliamo eventuali
  // open schedulati per evitare che la popover si materializzi subito dopo.
  const onTriggerClick = () => {
    clearTimers();
    setOpen(false);
    if (ownReaction) {
      // Toggle off
      onToggle(ownReaction);
      return;
    }
    // Quick like
    onToggle(DEFAULT_REACTION);
  };

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
        onClick={onTriggerClick}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={tReact("button_aria")}
        className={`flex items-center rounded-full transition-colors ${
          compact ? "gap-1 px-2 py-1 text-xs" : "gap-1.5 px-3 py-1.5 text-sm"
        } ${
          isActive
            ? "text-gc-accent hover:bg-gc-accent/10"
            : "text-gc-fg-muted hover:bg-gc-line/40 hover:text-gc-fg"
        }`}
      >
        {top.length === 0 ? (
          // Default: icona Like (diamante). Click = quick like (Facebook).
          // top.length === 0 implica totalCount === 0 e !isActive (un
          // viewer attivo ha sempre almeno 1 reaction nel set).
          <span
            className={`flex items-center justify-center leading-none ${
              compact ? "w-4 h-4 text-[12px]" : "w-5 h-5 text-[14px]"
            }`}
            aria-hidden="true"
          >
            {REACTION_EMOJI[DEFAULT_REACTION]}
          </span>
        ) : (
          <span className="flex items-center -space-x-1" aria-hidden="true">
            {top.map((kind, i) => (
              <span
                key={kind}
                style={{ zIndex: top.length - i }}
                className={`flex items-center justify-center leading-none ${
                  compact ? "w-4 h-4 text-[12px]" : "w-5 h-5 text-[14px]"
                }`}
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
          className="absolute z-50 left-0 -top-2 -translate-y-full origin-bottom-left bg-gc-modal-bg border border-gc-modal-border rounded-full shadow-xl px-1.5 py-1.5 flex items-center gap-0.5 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:slide-in-from-bottom-1 duration-150 ease-out"
        >
          {POST_REACTION_KINDS.map((kind, i) => {
            const active = ownReaction === kind;
            return (
              <div key={kind} className="relative group">
                {/* Tooltip LinkedIn-style: appare sopra l'icona on hover.
                    pointer-events-none così non blocca il click. */}
                <span
                  role="tooltip"
                  className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-7 whitespace-nowrap rounded-full bg-slate-800 px-2.5 py-0.5 text-[11px] font-medium text-white opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150 ease-out shadow-sm"
                >
                  {tReact(kind)}
                </span>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => onPick(kind)}
                  aria-label={tReact(kind)}
                  style={{ animationDelay: `${i * 15}ms` }}
                  className={`text-2xl leading-none w-9 h-9 rounded-full flex items-center justify-center transition-transform duration-150 ease-out will-change-transform animate-in fade-in-0 slide-in-from-bottom-1 hover:-translate-y-2 hover:scale-125 active:scale-95 ${
                    active ? "bg-gc-accent/15 ring-2 ring-gc-accent/40" : ""
                  }`}
                >
                  {REACTION_EMOJI[kind]}
                </button>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
