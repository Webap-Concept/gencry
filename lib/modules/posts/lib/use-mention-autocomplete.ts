"use client";
// lib/modules/posts/lib/use-mention-autocomplete.ts
//
// Hook che alimenta il popover di @mention per il composer (post +
// commenti). Pattern Twitter/Slack:
//   - Mentre l'utente digita, parsiamo dal caret indietro fino a uno
//     spazio o all'inizio. Se quel token comincia per "@" e ha solo
//     char [A-Za-z0-9_], siamo in mention-mode.
//   - Debounce 200ms + AbortController prima della Server Action.
//   - Keyboard ↑/↓ Enter/Tab Esc gestiti dal consumer via
//     `handleKeyDown(event)`.
//   - `applySelection(candidate)` ritorna {nextValue, nextCursor} da
//     applicare al textarea (rimpiazza "@parziale" con "@username ").
//
// Hookable: il backend è qualunque funzione async che ritorna
// MentionCandidate[]. Per usarlo con Upstash sorted-set, il caller
// passa `fetcher = (prefix) => searchUsersForMention({prefix})`.
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";
import type { MentionCandidate } from "@/lib/modules/posts/services/mention-index";

const DEBOUNCE_MS = 200;
const MAX_PREFIX = 32;

/** Token attualmente in mention-mode + range nel testo. */
type ActiveMention = {
  /** Es. "we" dopo aver digitato "@we" */
  prefix: string;
  /** Inclusive index del char "@" nel `value`. */
  start: number;
  /** Exclusive index dopo l'ultimo char tipato del token. */
  end: number;
};

export type MentionFetcher = (
  prefix: string,
  signal: AbortSignal,
) => Promise<MentionCandidate[]>;

export type UseMentionAutocompleteOptions = {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  /** Valore corrente del textarea (state controlled). */
  value: string;
  /** Setter del state controlled — l'hook chiama questo dopo
   *  applySelection per inserire @username nel testo. */
  onValueChange: (next: string) => void;
  /** Backend di search. Riceve prefix e AbortSignal. */
  fetcher: MentionFetcher;
};

export function useMentionAutocomplete(opts: UseMentionAutocompleteOptions) {
  const { textareaRef, value, onValueChange, fetcher } = opts;
  const [active, setActive] = useState<ActiveMention | null>(null);
  const [results, setResults] = useState<MentionCandidate[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);

  // Rileva il token attivo basato su caret position. Chiamato ad ogni
  // input / selection change.
  const recomputeActive = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    const caret = el.selectionStart ?? value.length;
    // Trova l'inizio del token: il primo whitespace andando indietro.
    let i = caret;
    while (i > 0 && !/\s/.test(value[i - 1]!)) i -= 1;
    const token = value.slice(i, caret);
    // Mention valida: inizia con "@" e ha 0+ char [A-Za-z0-9_].
    if (!token.startsWith("@")) {
      setActive(null);
      return;
    }
    const prefix = token.slice(1);
    if (prefix.length > MAX_PREFIX) {
      setActive(null);
      return;
    }
    if (prefix.length > 0 && !/^[A-Za-z0-9_]+$/.test(prefix)) {
      setActive(null);
      return;
    }
    setActive({ prefix, start: i, end: caret });
  }, [textareaRef, value]);

  // Debounce + abort della search quando il prefix cambia. Niente
  // fetch per prefix vuoto (just "@") — la UX standard è "scrivi
  // almeno 1 char per veder suggestion".
  useEffect(() => {
    if (!active || active.prefix.length === 0) {
      setResults([]);
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const r = await fetcher(active.prefix, ctrl.signal);
        if (!ctrl.signal.aborted) {
          setResults(r);
          setSelectedIndex(0);
          setLoading(false);
        }
      } catch {
        if (!ctrl.signal.aborted) {
          setResults([]);
          setLoading(false);
        }
      }
    }, DEBOUNCE_MS);
    return () => {
      ctrl.abort();
      clearTimeout(timer);
      setLoading(false);
    };
  }, [active, fetcher]);

  // Sostituisce il token "@parziale" col candidato selezionato + spazio.
  // Restituisce le coordinate per ripristinare il caret subito dopo
  // l'username (lato consumer aggiorna il textarea + caret).
  const applySelection = useCallback(
    (candidate: MentionCandidate) => {
      if (!active) return;
      const before = value.slice(0, active.start);
      const after = value.slice(active.end);
      const inserted = `@${candidate.username} `;
      const nextValue = before + inserted + after;
      const nextCursor = active.start + inserted.length;
      onValueChange(nextValue);
      setActive(null);
      setResults([]);
      // Riposiziona il caret dopo lo spazio inserito al prossimo tick
      // (così React ha già flushato il value del textarea).
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(nextCursor, nextCursor);
      });
    },
    [active, onValueChange, textareaRef, value],
  );

  // Keyboard handler che il consumer chiama da onKeyDown del textarea.
  // Quando il popover è aperto, intercettiamo le navigation key per
  // navigare la lista, e Enter/Tab per confermare. Ritorniamo true
  // se abbiamo gestito l'evento (il consumer deve early-return).
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>): boolean => {
      if (!active || results.length === 0) return false;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % results.length);
        return true;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => (i - 1 + results.length) % results.length);
        return true;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const candidate = results[selectedIndex];
        if (candidate) applySelection(candidate);
        return true;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setActive(null);
        return true;
      }
      return false;
    },
    [active, applySelection, results, selectedIndex],
  );

  return useMemo(
    () => ({
      /** True se il popover deve essere aperto (token "@..." attivo). */
      open: active !== null && (loading || results.length > 0),
      results,
      selectedIndex,
      setSelectedIndex,
      loading,
      handleKeyDown,
      /** Da chiamare in onInput / onSelect del textarea. */
      recomputeActive,
      /** Da chiamare quando si clicca un item del popover. */
      applySelection,
      /** Da chiamare per chiudere il popover programmaticamente (es. blur). */
      close: () => setActive(null),
    }),
    [
      active,
      applySelection,
      handleKeyDown,
      loading,
      recomputeActive,
      results,
      selectedIndex,
    ],
  );
}
