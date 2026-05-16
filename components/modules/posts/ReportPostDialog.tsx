"use client";
// components/modules/posts/ReportPostDialog.tsx
//
// Modal di segnalazione post. Lista motivi caricata lazy via Server Action
// alla prima apertura (settings cache 5min → call quasi free). Il modal
// è controllato dal parent (PostCard): isOpen + onOpenChange + onSubmitted.
import { useEffect, useState, useTransition } from "react";
import { useLocale } from "next-intl";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Flag,
  HelpCircle,
  Loader2,
  MessageCircleWarning,
  ShieldAlert,
  TrendingUp,
  VenetianMask,
  type LucideIcon,
} from "lucide-react";

// Map dei nomi icona supportati nei report reasons. Whitelist esplicita
// così lucide-react tree-shakea senza bundle bloat. Se l'admin salva
// un nome non in lista → fallback HelpCircle (resiliente, no crash).
const REASON_ICONS: Record<string, LucideIcon> = {
  Ban,
  AlertTriangle,
  TrendingUp,
  MessageCircleWarning,
  VenetianMask,
  ShieldAlert,
  HelpCircle,
};

function resolveReasonIcon(name: string | undefined): LucideIcon {
  if (!name) return HelpCircle;
  return REASON_ICONS[name] ?? HelpCircle;
}
import { Button } from "@/components/ui/button";
import { GcModal, GcModalContent } from "@/components/ui/gc-modal";
import {
  getReportReasonsForClient,
  reportPost,
} from "@/lib/modules/posts/actions";
import { usePostsError } from "@/lib/modules/posts/lib/use-posts-error";
import type { ReportReason } from "@/lib/modules/posts/services/report-reasons";

type Props = {
  postId: string;
  /** Display name autore (es. "@mariotest"). Usato per il prompt "Vuoi
   *  bloccare anche?". Se omesso, lo step finale degrada a sola conferma. */
  authorDisplayName?: string;
  /** Callback invocato se l'utente, dopo aver segnalato, vuole anche
   *  bloccare l'autore. Il parent monta il flusso block (modale conferma
   *  + action). Se omesso, lo step finale non offre l'opzione. */
  onWantsToBlockAuthor?: () => void;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmitted?: () => void;
};

function pickLocalized(
  byLocale: Record<string, string> | undefined,
  locale: string,
  fallback = "",
): string {
  if (!byLocale) return fallback;
  return byLocale[locale] ?? byLocale.en ?? byLocale.it ?? fallback;
}

export function ReportPostDialog({
  postId,
  authorDisplayName,
  onWantsToBlockAuthor,
  isOpen,
  onOpenChange,
  onSubmitted,
}: Props) {
  const locale = useLocale();
  const tErr = usePostsError();
  const [reasons, setReasons] = useState<ReportReason[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [details, setDetails] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, startSubmit] = useTransition();

  // Lazy fetch alla prima apertura. Reset su close.
  useEffect(() => {
    if (!isOpen) {
      setSelectedKey(null);
      setDetails("");
      setSubmitError(null);
      setSubmitted(false);
      return;
    }
    if (reasons !== null) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await getReportReasonsForClient();
        if (!cancelled) {
          setReasons(list);
          setLoadError(null);
        }
      } catch {
        if (!cancelled) setLoadError(tErr("posts.report.load_error"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, reasons]);

  const selectedReason = reasons?.find((r) => r.key === selectedKey) ?? null;
  const detailsRequired = selectedReason?.requiresDetails ?? false;
  const canSubmit =
    !!selectedReason &&
    (!detailsRequired || details.trim().length > 0) &&
    !isSubmitting;

  const handleSubmit = () => {
    if (!selectedReason) return;
    setSubmitError(null);
    startSubmit(async () => {
      const res = await reportPost({
        postId,
        reason: selectedReason.key,
        details: details.trim() || null,
      });
      if (res.ok) {
        setSubmitted(true);
        onSubmitted?.();
        // Non chiudiamo automaticamente: lo step finale offre il prompt
        // "Vuoi bloccare anche {author}?" (vedi render branch submitted).
      } else {
        setSubmitError(tErr(res.error, res));
      }
    });
  };

  return (
    <GcModal open={isOpen} onOpenChange={onOpenChange}>
      <GcModalContent
        icon={Flag}
        iconTone="warning"
        title="Segnala questo post"
        description="Scegli il motivo della segnalazione. Verrà esaminata da un moderatore."
        size="md"
        footer={
          submitted ? (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onOpenChange(false)}>
                Chiudi
              </Button>
              {onWantsToBlockAuthor && authorDisplayName ? (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    onOpenChange(false);
                    onWantsToBlockAuthor();
                  }}>
                  Blocca {authorDisplayName}
                </Button>
              ) : null}
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}>
                Annulla
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleSubmit}
                disabled={!canSubmit}>
                {isSubmitting ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : null}
                Invia segnalazione
              </Button>
            </>
          )
        }>
        {submitted ? (
          <div className="space-y-3 py-2">
            <p className="flex items-center gap-2 text-sm text-gc-fg">
              <CheckCircle2
                size={18}
                strokeWidth={2}
                className="text-gc-success-fg shrink-0"
                aria-hidden
              />
              Segnalazione inviata. Grazie per la collaborazione.
            </p>
            {onWantsToBlockAuthor && authorDisplayName ? (
              <p className="text-sm text-gc-fg-2">
                Vuoi anche bloccare {authorDisplayName}? Il blocco è
                mutuale: non vedrete più i contenuti l'uno dell'altro.
              </p>
            ) : null}
          </div>
        ) : reasons === null && !loadError ? (
          <div className="flex items-center justify-center py-6">
            <Loader2
              size={20}
              className="animate-spin text-gc-fg-muted"
              aria-label="Caricamento motivi"
            />
          </div>
        ) : loadError ? (
          <p className="text-sm text-gc-neg py-2">{loadError}</p>
        ) : (
          <div className="space-y-4">
            <div
              role="radiogroup"
              aria-label="Motivo della segnalazione"
              className="space-y-2">
              {(reasons ?? []).map((r) => {
                const label = pickLocalized(r.labelByLocale, locale, r.key);
                const desc = pickLocalized(r.descriptionByLocale, locale, "");
                const isActive = r.key === selectedKey;
                const ReasonIcon = resolveReasonIcon(r.icon);
                return (
                  <label
                    key={r.key}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      isActive
                        ? "border-gc-accent bg-gc-accent/5"
                        : "border-gc-line hover:bg-gc-bg-3"
                    }`}>
                    <input
                      type="radio"
                      name="report-reason"
                      value={r.key}
                      checked={isActive}
                      onChange={() => setSelectedKey(r.key)}
                      className="mt-0.5 w-4 h-4 cursor-pointer accent-gc-accent"
                    />
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-1.5 text-sm font-medium text-gc-fg">
                        <ReasonIcon
                          size={16}
                          strokeWidth={1.75}
                          className="shrink-0 text-gc-fg-2"
                          aria-hidden
                        />
                        {label}
                        {r.requiresDetails ? (
                          <span className="text-[10px] uppercase tracking-wide text-gc-fg-muted">
                            (dettagli obbligatori)
                          </span>
                        ) : null}
                      </span>
                      {desc ? (
                        <span className="block text-xs text-gc-fg-3 mt-0.5">
                          {desc}
                        </span>
                      ) : null}
                    </span>
                  </label>
                );
              })}
            </div>

            {selectedReason ? (
              <div className="space-y-1.5">
                <label
                  htmlFor="report-details"
                  className="text-xs font-medium text-gc-fg">
                  Dettagli {detailsRequired ? "(obbligatori)" : "(opzionali)"}
                </label>
                <textarea
                  id="report-details"
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  placeholder="Aggiungi un contesto utile per la moderazione (max 2000 caratteri)"
                  maxLength={2000}
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg border border-gc-line bg-gc-bg text-sm text-gc-fg focus:outline-none focus:border-gc-accent resize-none"
                />
              </div>
            ) : null}

            {submitError ? (
              <p className="text-xs text-gc-neg">Errore: {submitError}</p>
            ) : null}
          </div>
        )}
      </GcModalContent>
    </GcModal>
  );
}
