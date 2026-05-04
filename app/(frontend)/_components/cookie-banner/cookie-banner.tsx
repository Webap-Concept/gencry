"use client";

import { Cookie, Settings2, X } from "lucide-react";
import { useState, useTransition } from "react";
import {
  acceptAllCookiesAction,
  rejectAllCookiesAction,
  saveCustomCookiesAction,
} from "./actions";

type Props = {
  /** Link alla privacy/cookie policy pubblica, se configurato. */
  privacyUrl?: string | null;
};

const CATEGORIES = [
  {
    key: "necessary",
    label: "Necessari",
    description:
      "Indispensabili per il funzionamento del sito (sessione, sicurezza, preferenze di base). Sempre attivi: senza non potresti navigare.",
    locked: true,
  },
  {
    key: "preferences",
    label: "Preferenze",
    description:
      "Memorizzano le tue scelte (lingua, tema, visualizzazioni) per personalizzare l'esperienza nelle visite successive.",
    locked: false,
  },
  {
    key: "analytics",
    label: "Statistiche",
    description:
      "Ci aiutano a capire come viene usato il sito (pagine più viste, errori). I dati sono aggregati e ci servono per migliorare.",
    locked: false,
  },
  {
    key: "marketing",
    label: "Marketing",
    description:
      "Permettono di mostrare contenuti e annunci più rilevanti per te su questo sito o su piattaforme di terze parti.",
    locked: false,
  },
] as const;

export function CookieBanner({ privacyUrl }: Props) {
  const [isPending, startTransition] = useTransition();
  const [showCustomize, setShowCustomize] = useState(false);

  // Stato locale per la modale "Personalizza".
  const [preferences, setPreferences] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  const handleAcceptAll = () => {
    startTransition(() => {
      acceptAllCookiesAction();
    });
  };

  const handleRejectAll = () => {
    startTransition(() => {
      rejectAllCookiesAction();
    });
  };

  const handleSaveCustom = () => {
    const fd = new FormData();
    if (preferences) fd.set("preferences", "on");
    if (analytics) fd.set("analytics", "on");
    if (marketing) fd.set("marketing", "on");
    startTransition(() => {
      saveCustomCookiesAction(fd);
    });
  };

  return (
    <>
      {/* Banner sticky in basso, non bloccante.
          z-30 per stare sotto modali/dropdown ma sopra il contenuto. */}
      <div
        role="region"
        aria-label="Avviso cookie"
        className="fixed inset-x-0 bottom-0 z-30 px-3 pb-3 sm:px-4 sm:pb-4 pointer-events-none">
        <div
          className="pointer-events-auto mx-auto max-w-5xl rounded-2xl shadow-2xl"
          style={{
            background: "#ffffff",
            border: "1px solid #e5e7eb",
            boxShadow: "0 10px 40px -10px rgba(0,0,0,0.25)",
          }}>
          <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <span
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "#fef3c7", color: "#b45309" }}
                aria-hidden>
                <Cookie size={18} />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold" style={{ color: "#111827" }}>
                  Rispettiamo la tua privacy
                </p>
                <p className="text-xs sm:text-sm mt-0.5" style={{ color: "#4b5563" }}>
                  Usiamo cookie tecnici necessari e, con il tuo consenso, cookie
                  di preferenze, statistiche e marketing per migliorare il sito.
                  {" "}
                  {privacyUrl && (
                    <a
                      href={privacyUrl}
                      className="underline"
                      style={{ color: "#b45309" }}>
                      Maggiori informazioni
                    </a>
                  )}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setShowCustomize(true)}
                disabled={isPending}
                className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
                style={{
                  background: "#f3f4f6",
                  color: "#374151",
                }}>
                <Settings2 size={14} />
                Personalizza
              </button>
              <button
                type="button"
                onClick={handleRejectAll}
                disabled={isPending}
                className="text-xs sm:text-sm font-medium px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
                style={{
                  background: "#f3f4f6",
                  color: "#374151",
                }}>
                Rifiuta tutti
              </button>
              <button
                type="button"
                onClick={handleAcceptAll}
                disabled={isPending}
                className="text-xs sm:text-sm font-semibold px-4 py-2 rounded-lg text-white transition-colors disabled:opacity-50"
                style={{ background: "#b45309" }}>
                Accetta tutti
              </button>
            </div>
          </div>
        </div>
      </div>

      {showCustomize && (
        <CustomizeModal
          isPending={isPending}
          preferences={preferences}
          analytics={analytics}
          marketing={marketing}
          onTogglePreferences={setPreferences}
          onToggleAnalytics={setAnalytics}
          onToggleMarketing={setMarketing}
          onClose={() => setShowCustomize(false)}
          onAcceptAll={handleAcceptAll}
          onRejectAll={handleRejectAll}
          onSaveCustom={handleSaveCustom}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Modal "Personalizza" — toggle per categoria.
// ---------------------------------------------------------------------------

function CustomizeModal({
  isPending,
  preferences,
  analytics,
  marketing,
  onTogglePreferences,
  onToggleAnalytics,
  onToggleMarketing,
  onClose,
  onAcceptAll,
  onRejectAll,
  onSaveCustom,
}: {
  isPending: boolean;
  preferences: boolean;
  analytics: boolean;
  marketing: boolean;
  onTogglePreferences: (v: boolean) => void;
  onToggleAnalytics: (v: boolean) => void;
  onToggleMarketing: (v: boolean) => void;
  onClose: () => void;
  onAcceptAll: () => void;
  onRejectAll: () => void;
  onSaveCustom: () => void;
}) {
  const stateFor = (key: string): boolean => {
    if (key === "necessary") return true;
    if (key === "preferences") return preferences;
    if (key === "analytics") return analytics;
    if (key === "marketing") return marketing;
    return false;
  };

  const setterFor = (key: string): ((v: boolean) => void) => {
    if (key === "preferences") return onTogglePreferences;
    if (key === "analytics") return onToggleAnalytics;
    if (key === "marketing") return onToggleMarketing;
    return () => {};
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50"
        style={{
          background: "rgba(0,0,0,0.45)",
          backdropFilter: "blur(2px)",
        }}
        onClick={onClose}
        aria-hidden
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cookie-customize-title"
        className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="rounded-2xl shadow-xl pointer-events-auto w-full max-w-lg flex flex-col"
          style={{
            background: "#ffffff",
            border: "1px solid #e5e7eb",
            maxHeight: "85vh",
          }}>
          <div
            className="flex items-center gap-3 px-5 py-4"
            style={{ borderBottom: "1px solid #e5e7eb" }}>
            <span
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: "#fef3c7", color: "#b45309" }}
              aria-hidden>
              <Cookie size={16} />
            </span>
            <h2
              id="cookie-customize-title"
              className="flex-1 text-base font-semibold"
              style={{ color: "#111827" }}>
              Preferenze cookie
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Chiudi"
              className="w-7 h-7 rounded-md hover:bg-gray-100 flex items-center justify-center"
              style={{ color: "#6b7280" }}>
              <X size={16} />
            </button>
          </div>

          <div className="flex-1 overflow-auto px-5 py-4">
            <p className="text-sm mb-4" style={{ color: "#4b5563" }}>
              Scegli quali categorie di cookie attivare. Puoi cambiare idea in
              qualsiasi momento dalle impostazioni.
            </p>

            <ul className="space-y-3">
              {CATEGORIES.map((cat) => {
                const checked = stateFor(cat.key);
                const setChecked = setterFor(cat.key);
                return (
                  <li
                    key={cat.key}
                    className="rounded-lg p-3 flex items-start gap-3"
                    style={{
                      background: "#f9fafb",
                      border: "1px solid #e5e7eb",
                    }}>
                    <input
                      id={`cookie-cat-${cat.key}`}
                      type="checkbox"
                      checked={checked}
                      disabled={cat.locked || isPending}
                      onChange={(e) => setChecked(e.target.checked)}
                      className="mt-0.5 w-4 h-4 cursor-pointer accent-amber-600"
                      style={cat.locked ? { cursor: "not-allowed", opacity: 0.7 } : undefined}
                    />
                    <label
                      htmlFor={`cookie-cat-${cat.key}`}
                      className="flex-1 min-w-0 cursor-pointer"
                      style={cat.locked ? { cursor: "not-allowed" } : undefined}>
                      <div className="text-sm font-medium" style={{ color: "#111827" }}>
                        {cat.label}
                        {cat.locked && (
                          <span
                            className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wide"
                            style={{ background: "#e5e7eb", color: "#374151" }}>
                            Sempre attivi
                          </span>
                        )}
                      </div>
                      <div className="text-[12px] mt-0.5" style={{ color: "#6b7280" }}>
                        {cat.description}
                      </div>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>

          <div
            className="flex flex-wrap items-center justify-end gap-2 px-5 py-4"
            style={{ borderTop: "1px solid #e5e7eb" }}>
            <button
              type="button"
              onClick={onRejectAll}
              disabled={isPending}
              className="text-xs font-medium px-3 py-2 rounded-md transition-colors disabled:opacity-50"
              style={{ background: "#f3f4f6", color: "#374151" }}>
              Rifiuta tutti
            </button>
            <button
              type="button"
              onClick={onSaveCustom}
              disabled={isPending}
              className="text-xs font-semibold px-3 py-2 rounded-md transition-colors disabled:opacity-50"
              style={{ background: "#374151", color: "#ffffff" }}>
              {isPending ? "Salvataggio…" : "Salva selezione"}
            </button>
            <button
              type="button"
              onClick={onAcceptAll}
              disabled={isPending}
              className="text-xs font-semibold px-3 py-2 rounded-md text-white transition-colors disabled:opacity-50"
              style={{ background: "#b45309" }}>
              Accetta tutti
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
