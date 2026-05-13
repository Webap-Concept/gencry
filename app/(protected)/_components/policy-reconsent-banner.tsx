"use client";

import { signOut } from "@/app/(login)/actions";
import type { ActionState } from "@/lib/auth/middleware";
import type { PolicyNotificationKey } from "@/lib/db/schema";
import { AlertTriangle, ExternalLink, X } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { acceptUpdatedConsentsAction } from "./policy-reconsent-actions";

type PendingItem = {
  policyKey: PolicyNotificationKey;
  newVersion: string;
  acceptedVersion: string;
};

type Props = {
  /** Solo policy che richiedono effettivamente riaccettazione. */
  items: PendingItem[];
  /** Slug pubblico della pagina di sistema, per il link "Apri policy". */
  slugs: Partial<Record<PolicyNotificationKey, string>>;
  /** "banner" = striscia gentile non chiudibile;
   *  "blocking" = overlay full-screen, l'utente NON può navigare. */
  mode: "banner" | "blocking";
  /** Giorni rimanenti prima del passaggio a bloccante. Solo informativo. */
  daysRemaining: number | null;
};

const POLICY_LABELS: Record<PolicyNotificationKey, string> = {
  terms: "Termini di Servizio",
  privacy: "Privacy Policy",
  marketing: "Comunicazioni Marketing",
};

export function PolicyReconsentBanner({
  items,
  slugs,
  mode,
  daysRemaining,
}: Props) {
  const isBlocking = mode === "blocking";
  // In modalità bloccante la modale è aperta da subito e non chiudibile.
  const [modalOpen, setModalOpen] = useState(isBlocking);

  // Se il modo cambia in blocking dopo aver montato (es. revalidate), forza
  // la modale aperta.
  useEffect(() => {
    if (isBlocking) setModalOpen(true);
  }, [isBlocking]);

  if (items.length === 0) return null;

  const hasTerms = items.some((i) => i.policyKey === "terms");
  const hasPrivacy = items.some((i) => i.policyKey === "privacy");
  const hasMarketing = items.some((i) => i.policyKey === "marketing");

  const bannerLabel = (() => {
    if (items.length === 1) {
      return `Abbiamo aggiornato ${POLICY_LABELS[items[0].policyKey]}.`;
    }
    return `Abbiamo aggiornato ${items.length} policy.`;
  })();

  return (
    <>
      {/* Banner sticky in cima, sempre visibile (non chiudibile per design). */}
      <div
        role="status"
        aria-live="polite"
        className="sticky top-0 z-40 px-4 py-2.5 text-sm flex items-center gap-3 flex-wrap"
        style={{
          background: "var(--gc-warning-bg)",
          borderBottom: "1px solid color-mix(in srgb, var(--gc-warning-fg) 35%, transparent)",
          color: "var(--gc-fg)",
        }}>
        <AlertTriangle size={16} className="text-gc-warning-fg shrink-0" />
        <span className="font-medium">{bannerLabel}</span>
        {!isBlocking && daysRemaining !== null && (
          <span
            className="text-xs"
            style={{ color: "var(--gc-text-muted, #6b7280)" }}>
            {daysRemaining > 0
              ? `Riaccetta entro ${daysRemaining} ${daysRemaining === 1 ? "giorno" : "giorni"}.`
              : "Riaccetta oggi per continuare a usare il servizio."}
          </span>
        )}
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="ml-auto text-xs font-semibold px-3 py-1 rounded-md bg-gc-warning-fg text-white hover:opacity-90 transition-colors">
          {isBlocking ? "Rivedi e accetta" : "Rivedi"}
        </button>
      </div>

      {modalOpen && (
        <ReconsentModal
          items={items}
          slugs={slugs}
          isBlocking={isBlocking}
          hasTerms={hasTerms}
          hasPrivacy={hasPrivacy}
          hasMarketing={hasMarketing}
          onClose={isBlocking ? null : () => setModalOpen(false)}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Modal — checkbox per ogni policy + submit form
// ---------------------------------------------------------------------------

function ReconsentModal({
  items,
  slugs,
  isBlocking,
  hasTerms,
  hasPrivacy,
  hasMarketing,
  onClose,
}: {
  items: PendingItem[];
  slugs: Partial<Record<PolicyNotificationKey, string>>;
  isBlocking: boolean;
  hasTerms: boolean;
  hasPrivacy: boolean;
  hasMarketing: boolean;
  /** Null = non chiudibile (bloccante). */
  onClose: (() => void) | null;
}) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    acceptUpdatedConsentsAction,
    {},
  );

  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [acceptedMarketing, setAcceptedMarketing] = useState(false);

  // Bottone "Accetta e continua" abilitato solo se i due obbligatori
  // (terms, privacy) sono entrambi spuntati. Marketing è skippabile.
  const requiredOk =
    (!hasTerms || acceptedTerms) && (!hasPrivacy || acceptedPrivacy);

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-gc-overlay"
        style={{ backdropFilter: "blur(2px)" }}
        onClick={onClose ?? undefined}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="reconsent-title"
        className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="rounded-2xl shadow-xl pointer-events-auto w-full max-w-lg flex flex-col bg-gc-modal-bg border border-gc-modal-border"
          style={{ maxHeight: "85vh" }}>
          {/* Header */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-gc-modal-border">
            <span
              className="w-8 h-8 rounded-lg flex items-center justify-center bg-gc-warning-bg text-gc-warning-fg shrink-0">
              <AlertTriangle size={16} />
            </span>
            <h2
              id="reconsent-title"
              className="flex-1 text-base font-semibold text-gc-fg">
              Conferma le policy aggiornate
            </h2>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Chiudi"
                className="w-7 h-7 rounded-md hover:bg-gc-bg-3 flex items-center justify-center text-gc-fg-3">
                <X size={16} />
              </button>
            )}
          </div>

          {/* Body */}
          <form action={formAction} className="flex-1 overflow-auto px-5 py-4">
            <p className="text-sm mb-4 text-gc-fg-2">
              Abbiamo aggiornato le policy che hai accettato in passato.
              Spunta le caselle per confermare la nuova versione. I link
              aprono il testo completo in una nuova scheda.
            </p>

            <ul className="space-y-3">
              {items.map((it) => {
                const slug = slugs[it.policyKey];
                const isMarketing = it.policyKey === "marketing";
                const checked =
                  it.policyKey === "terms"
                    ? acceptedTerms
                    : it.policyKey === "privacy"
                      ? acceptedPrivacy
                      : acceptedMarketing;
                const setChecked =
                  it.policyKey === "terms"
                    ? setAcceptedTerms
                    : it.policyKey === "privacy"
                      ? setAcceptedPrivacy
                      : setAcceptedMarketing;
                return (
                  <li
                    key={it.policyKey}
                    className="rounded-lg p-3 flex items-start gap-3 bg-gc-bg-3 border border-gc-line">
                    <input
                      type="checkbox"
                      name={it.policyKey}
                      checked={checked}
                      onChange={(e) => setChecked(e.target.checked)}
                      className="mt-0.5 w-4 h-4 cursor-pointer accent-gc-accent"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gc-fg">
                        {POLICY_LABELS[it.policyKey]}
                        {!isMarketing && (
                          <span
                            className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wide text-gc-neg"
                            style={{
                              background: "color-mix(in srgb, var(--gc-neg) 18%, transparent)",
                            }}>
                            Obbligatorio
                          </span>
                        )}
                        {isMarketing && (
                          <span className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wide bg-gc-line text-gc-fg-2">
                            Opzionale
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] mt-0.5 text-gc-fg-3">
                        Versione precedente: {it.acceptedVersion} → nuova:{" "}
                        {it.newVersion}
                      </div>
                      {slug && (
                        <a
                          href={`/${slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs mt-1.5 text-gc-warning-fg hover:underline">
                          Apri il testo completo
                          <ExternalLink size={11} />
                        </a>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>

            {state.error && (
              <p className="mt-3 text-xs text-gc-neg">{state.error}</p>
            )}
            {state.success && (
              <p className="mt-3 text-xs text-gc-success-fg">{state.success}</p>
            )}

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 mt-5">
              {isBlocking ? (
                <button
                  type="button"
                  onClick={() => signOut()}
                  className="text-xs font-medium px-3 py-2 rounded-md text-gc-fg-2 hover:bg-gc-bg-3"
                  disabled={isPending}>
                  Esci
                </button>
              ) : (
                onClose && (
                  <button
                    type="button"
                    onClick={onClose}
                    className="text-xs font-medium px-3 py-2 rounded-md text-gc-fg-2 hover:bg-gc-bg-3"
                    disabled={isPending}>
                    Decidi più tardi
                  </button>
                )
              )}
              <button
                type="submit"
                disabled={!requiredOk || isPending}
                className="text-sm font-medium px-4 py-2 rounded-md bg-gc-warning-fg text-white hover:opacity-90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {isPending ? "Salvataggio…" : "Accetta e continua"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
