"use client";
// components/modules/posts/CommentComposer.tsx
//
// Composer minimale per i commenti. Solo testo + char counter. Niente
// media (decisione di scope v1: gli upload R2 li gestisce la PostComposer
// del post stesso). Niente parser inline visivo del $TICKER/@mention: il
// rendering finale lato CommentItem usa PostBody che già linka, e per il
// composer evitiamo il distraction dell'auto-highlighting durante la
// scrittura.
//
// onSubmit: chiamata dal genitore (CommentsThread) che si occupa di:
//   - Server Action createComment
//   - optimistic prepend al thread
//   - dedup realtime via useCommentsLiveSignal.registerOwnComment
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, Loader2 } from "lucide-react";
import { useMentionAutocomplete } from "@/lib/modules/posts/lib/use-mention-autocomplete";
import { searchUsersForMention } from "@/lib/modules/posts/actions";
import { MentionPopover } from "./MentionPopover";

export type CommentComposerProps = {
  /** Submit handler. Riceve il body trimmed. Ritorna { ok, error? }.
   *  Se ok=true il composer si svuota e resetta. */
  onSubmit: (body: string) => Promise<{ ok: boolean; error?: string }>;
  /** Max body length (default 2000, allineato CHECK schema). */
  maxBodyLength?: number;
  /** Placeholder. Se omesso usa la chiave i18n "posts.comments.composer.placeholder". */
  placeholder?: string;
  /** Reply-to display (es. "@alice"). Quando settato il composer precompila
   *  il body con "{replyToHandle} " e mostra hint visuale. */
  replyToHandle?: string;
  /** Disabled (es. non loggato, banned). */
  disabled?: boolean;
  /** Compact mode: padding ridotto + textarea più piccola. Usata sotto
   *  un CommentItem per le reply inline. */
  compact?: boolean;
  /** Auto-focus al mount (es. quando l'utente clicca "Rispondi"). */
  autoFocus?: boolean;
  /** Cancel handler: se settato mostra un X per chiudere il composer
   *  (utile per la reply box che parte hidden). */
  onCancel?: () => void;
};

export function CommentComposer({
  onSubmit,
  maxBodyLength = 2000,
  placeholder,
  replyToHandle,
  disabled,
  compact,
  autoFocus,
  onCancel,
}: CommentComposerProps) {
  const t = useTranslations("posts.comments");
  const tCommon = useTranslations("posts.common");
  const [body, setBody] = useState(replyToHandle ? `${replyToHandle} ` : "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);

  // @mention autocomplete (Upstash sorted-set backend). Stesso pattern del
  // PostComposer: hook + popover ancorato sotto il textarea.
  const mentionFetcher = useCallback(async (prefix: string) => {
    const res = await searchUsersForMention({ prefix });
    return res.ok ? res.data.results : [];
  }, []);
  const mention = useMentionAutocomplete({
    textareaRef: ref,
    value: body,
    onValueChange: setBody,
    fetcher: mentionFetcher,
  });

  useEffect(() => {
    if (autoFocus && ref.current) {
      ref.current.focus();
      // Posiziona il cursore alla fine (es. dopo "@alice ").
      const len = ref.current.value.length;
      ref.current.setSelectionRange(len, len);
    }
  }, [autoFocus]);

  // Auto-resize textarea: cresce con il contenuto entro un max.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, compact ? 120 : 200)}px`;
  }, [body, compact]);

  const trimmed = body.trim();
  // Quando è una reply, il composer pre-popola "@username" come prefill.
  // Considera "vuoto" anche il caso in cui l'utente non aggiunga nulla
  // oltre al prefill — non ha senso submitare solo la citazione.
  const prefillTrimmed = replyToHandle?.trim() ?? "";
  const isEmpty =
    trimmed.length === 0 ||
    (prefillTrimmed.length > 0 && trimmed === prefillTrimmed);
  const tooLong = trimmed.length > maxBodyLength;
  const canSubmit = !isEmpty && !tooLong && !submitting && !disabled;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    const res = await onSubmit(trimmed);
    setSubmitting(false);
    if (res.ok) {
      setBody("");
      onCancel?.();
    } else {
      setError(res.error ?? t("composer.error_generic"));
    }
  }

  const padCls = compact ? "p-2" : "p-3";
  const taPadCls = compact ? "py-1.5 px-2 min-h-[44px] text-sm" : "py-2 px-3 min-h-[64px]";
  const counterCls = trimmed.length > maxBodyLength * 0.9
    ? tooLong
      ? "text-gc-neg"
      : "text-gc-warning-fg"
    : "text-gc-fg-muted";

  return (
    <form
      onSubmit={handleSubmit}
      className={`flex items-end gap-2 border border-gc-line/60 rounded-gc-sm bg-gc-bg-2 ${padCls}`}
    >
      <div className="relative flex-1">
        <textarea
          ref={ref}
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            mention.recomputeActive();
          }}
          onSelect={() => mention.recomputeActive()}
          onKeyDown={(e) => {
            // Il mention handler ha priorità sull'Enter→submit: se il
            // popover è aperto Enter conferma il candidato, non sottomette.
            if (mention.handleKeyDown(e)) return;
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canSubmit) {
              handleSubmit(e);
            }
            if (e.key === "Escape" && onCancel) {
              onCancel();
            }
          }}
          onBlur={() => {
            setTimeout(() => mention.close(), 150);
          }}
          disabled={disabled || submitting}
          placeholder={placeholder ?? t("composer.placeholder")}
          rows={1}
          maxLength={maxBodyLength + 50 /* over-bound safety, validation handle the real cap */}
          className={`w-full resize-none bg-gc-bg-1 rounded-gc-sm outline-none text-gc-fg placeholder:text-gc-fg-muted/70 ${taPadCls}`}
          aria-label={t("composer.aria_label")}
        />
        <MentionPopover
          open={mention.open}
          results={mention.results}
          selectedIndex={mention.selectedIndex}
          loading={mention.loading}
          onSelect={mention.applySelection}
          onHover={mention.setSelectedIndex}
          emptyLabel={t("composer.mention_no_results")}
          loadingLabel={t("composer.mention_loading")}
        />
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-gc-accent text-white disabled:bg-gc-bg-3 disabled:text-gc-fg-2 transition"
          aria-label={tCommon("submit")}
        >
          {submitting ? (
            <Loader2 className="animate-spin" size={16} />
          ) : (
            <ArrowRight size={18} strokeWidth={2.25} />
          )}
        </button>
        <span className={`text-[10px] tabular-nums ${counterCls}`}>
          {trimmed.length}/{maxBodyLength}
        </span>
      </div>
      {error ? (
        <p className="absolute mt-12 text-xs text-gc-neg" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
