"use client";
// components/modules/posts/ReportPostDialog.tsx
//
// Modal di segnalazione post. Lista motivi caricata lazy via Server Action
// alla prima apertura (settings cache 5min → call quasi free). Il modal
// è controllato dal parent (PostCard): isOpen + onOpenChange + onReported.
import { useEffect, useState, useTransition } from "react";
import { useLocale } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import {
  getReportReasonsForClient,
  reportPost,
} from "@/lib/modules/posts/actions";
import type { ReportReason } from "@/lib/modules/posts/services/report-reasons";

type Props = {
  postId: string;
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
  isOpen,
  onOpenChange,
  onSubmitted,
}: Props) {
  const locale = useLocale();
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
      // Pulizia state quando il modal viene chiuso, così riapertura =
      // form pulito.
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
        if (!cancelled) setLoadError("posts.report.load_error");
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
        // Auto-close dopo ~1.2s per dare feedback visivo.
        setTimeout(() => onOpenChange(false), 1200);
      } else {
        setSubmitError(res.error);
      }
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Segnala questo post</DialogTitle>
          <DialogDescription>
            Scegli il motivo della segnalazione. Verrà esaminata da un
            moderatore.
          </DialogDescription>
        </DialogHeader>

        {submitted ? (
          <p className="text-sm text-gc-fg py-3">
            ✅ Segnalazione inviata. Grazie per la collaborazione.
          </p>
        ) : reasons === null && !loadError ? (
          <div className="flex items-center justify-center py-6">
            <Loader2
              size={20}
              className="animate-spin text-gc-fg-muted"
              aria-label="Caricamento motivi"
            />
          </div>
        ) : loadError ? (
          <p className="text-sm text-gc-danger py-3">
            Impossibile caricare i motivi di segnalazione. Riprova.
          </p>
        ) : (
          <>
            <div
              role="radiogroup"
              aria-label="Motivo della segnalazione"
              className="space-y-1.5 max-h-[40vh] overflow-y-auto pr-1">
              {(reasons ?? []).map((r) => {
                const label = pickLocalized(r.labelByLocale, locale, r.key);
                const desc = pickLocalized(r.descriptionByLocale, locale, "");
                const isActive = r.key === selectedKey;
                return (
                  <label
                    key={r.key}
                    className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${
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
                      className="mt-0.5"
                    />
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-1.5 text-sm font-medium text-gc-fg">
                        {r.icon ? <span aria-hidden>{r.icon}</span> : null}
                        {label}
                        {r.requiresDetails ? (
                          <span className="text-[10px] uppercase tracking-wide text-gc-fg-muted">
                            (dettagli obbligatori)
                          </span>
                        ) : null}
                      </span>
                      {desc ? (
                        <span className="block text-xs text-gc-fg-muted mt-0.5">
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
              <p className="text-xs text-gc-danger">
                Errore: {submitError}
              </p>
            ) : null}
          </>
        )}

        {!submitted ? (
          <DialogFooter>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
              className="px-3 py-1.5 rounded-lg text-sm text-gc-fg-muted hover:text-gc-fg disabled:opacity-50">
              Annulla
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="px-4 py-1.5 rounded-lg text-sm font-medium text-white bg-gc-accent disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
              {isSubmitting ? (
                <Loader2 size={14} className="animate-spin" />
              ) : null}
              Invia segnalazione
            </button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
