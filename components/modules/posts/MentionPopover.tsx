"use client";
// components/modules/posts/MentionPopover.tsx
//
// Popover lista candidati per l'autocomplete @mention. Renderizzato
// SOTTO il textarea (no caret-tracking — pattern Slack/Discord). Posizione
// = absolute positioned in un wrapper relative attorno al textarea.
//
// Il caller decide:
//   - dove montarlo (in un wrapper relative attorno al textarea o
//     altrove con position assolute calcolata)
//   - lo z-index del contesto (potrebbe vivere dentro un Dialog/Modale)
import { UserAvatar } from "@/components/ui/user-avatar";
import type { MentionCandidate } from "@/lib/modules/posts/services/mention-index";

export type MentionPopoverProps = {
  open: boolean;
  results: MentionCandidate[];
  selectedIndex: number;
  loading: boolean;
  onSelect: (candidate: MentionCandidate) => void;
  onHover: (index: number) => void;
  /** Label "Nessun risultato" tradotta dal consumer. */
  emptyLabel: string;
  /** Label "Carico..." tradotta dal consumer. */
  loadingLabel: string;
  /** Classes extra per il wrapper (es. posizione absolute custom). */
  className?: string;
};

export function MentionPopover({
  open,
  results,
  selectedIndex,
  loading,
  onSelect,
  onHover,
  emptyLabel,
  loadingLabel,
  className,
}: MentionPopoverProps) {
  if (!open) return null;
  return (
    <div
      role="listbox"
      aria-label="Suggerimenti utenti"
      className={`absolute left-0 right-0 top-full mt-1 z-40 max-h-72 overflow-y-auto rounded-lg border border-gc-line bg-gc-bg-2 shadow-lg ${
        className ?? ""
      }`.trim()}
    >
      {loading && results.length === 0 ? (
        <div className="px-3 py-2 text-xs text-gc-fg-muted">{loadingLabel}</div>
      ) : results.length === 0 ? (
        <div className="px-3 py-2 text-xs text-gc-fg-muted">{emptyLabel}</div>
      ) : (
        results.map((c, i) => {
          const fullName = [c.firstName, c.lastName].filter(Boolean).join(" ");
          const isActive = i === selectedIndex;
          return (
            <button
              key={c.id}
              type="button"
              role="option"
              aria-selected={isActive}
              onMouseEnter={() => onHover(i)}
              onMouseDown={(e) => {
                // mousedown invece di onClick: il blur del textarea su
                // click chiuderebbe il popover prima del callback.
                e.preventDefault();
                onSelect(c);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
                isActive ? "bg-gc-bg-3" : "hover:bg-gc-bg-3/50"
              }`}
            >
              <UserAvatar user={c} size={32} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gc-fg truncate">
                  @{c.username}
                </div>
                {fullName ? (
                  <div className="text-xs text-gc-fg-muted truncate">
                    {fullName}
                  </div>
                ) : null}
              </div>
            </button>
          );
        })
      )}
    </div>
  );
}
