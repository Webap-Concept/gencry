"use client";

import { Cookie, ExternalLink, X } from "lucide-react";
import { useState, useTransition } from "react";
import {
  acceptAllCookiesAction,
  rejectAllCookiesAction,
  saveCustomCookiesAction,
} from "./actions";

/**
 * Modale "Personalizza preferenze cookie" — usata sia dal banner pubblico
 * (visitatore che decide la prima volta) sia dai trigger di modifica
 * (footer pubblico, /settings/privacy) per chi ha già scelto.
 *
 * Riceve `initialPrefs` per pre-compilare i toggle in caso di modifica.
 * Default → tutti false (caso "prima decisione").
 */

export type CustomizeInitialPrefs = {
  preferences: boolean;
  analytics: boolean;
  marketing: boolean;
};

const DEFAULT_INITIAL: CustomizeInitialPrefs = {
  preferences: false,
  analytics: false,
  marketing: false,
};

const CATEGORIES = [
  {
    key: "necessary" as const,
    label: "Necessari",
    description:
      "Indispensabili per il funzionamento del sito (sessione, sicurezza, preferenze di base). Sempre attivi: senza non potresti navigare.",
    locked: true,
  },
  {
    key: "preferences" as const,
    label: "Preferenze",
    description:
      "Memorizzano le tue scelte (lingua, tema, visualizzazioni) per personalizzare l'esperienza nelle visite successive.",
    locked: false,
  },
  {
    key: "analytics" as const,
    label: "Statistiche",
    description:
      "Ci aiutano a capire come viene usato il sito (pagine più viste, errori). I dati sono aggregati e ci servono per migliorare.",
    locked: false,
  },
  {
    key: "marketing" as const,
    label: "Marketing",
    description:
      "Permettono di mostrare contenuti e annunci più rilevanti per te su questo sito o su piattaforme di terze parti.",
    locked: false,
  },
];

export function CookieCustomizeModal({
  initialPrefs = DEFAULT_INITIAL,
  policyUrl,
  onClose,
}: {
  initialPrefs?: CustomizeInitialPrefs;
  policyUrl?: string | null;
  onClose: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [preferences, setPreferences] = useState(initialPrefs.preferences);
  const [analytics, setAnalytics] = useState(initialPrefs.analytics);
  const [marketing, setMarketing] = useState(initialPrefs.marketing);

  const handleAcceptAll = () =>
    startTransition(() => {
      acceptAllCookiesAction();
    });

  const handleRejectAll = () =>
    startTransition(() => {
      rejectAllCookiesAction();
    });

  const handleSaveCustom = () => {
    const fd = new FormData();
    if (preferences) fd.set("preferences", "on");
    if (analytics) fd.set("analytics", "on");
    if (marketing) fd.set("marketing", "on");
    startTransition(() => {
      saveCustomCookiesAction(fd);
    });
  };

  const stateFor = (key: (typeof CATEGORIES)[number]["key"]): boolean => {
    if (key === "necessary") return true;
    if (key === "preferences") return preferences;
    if (key === "analytics") return analytics;
    return marketing;
  };

  const setterFor = (
    key: (typeof CATEGORIES)[number]["key"],
  ): ((v: boolean) => void) => {
    if (key === "preferences") return setPreferences;
    if (key === "analytics") return setAnalytics;
    if (key === "marketing") return setMarketing;
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
              qualsiasi momento.
              {policyUrl && (
                <>
                  {" "}
                  <a
                    href={policyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 underline"
                    style={{ color: "#b45309" }}>
                    Cookie policy
                    <ExternalLink size={11} />
                  </a>
                </>
              )}
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
                      style={
                        cat.locked
                          ? { cursor: "not-allowed", opacity: 0.7 }
                          : undefined
                      }
                    />
                    <label
                      htmlFor={`cookie-cat-${cat.key}`}
                      className="flex-1 min-w-0 cursor-pointer"
                      style={cat.locked ? { cursor: "not-allowed" } : undefined}>
                      <div
                        className="text-sm font-medium"
                        style={{ color: "#111827" }}>
                        {cat.label}
                        {cat.locked && (
                          <span
                            className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wide"
                            style={{ background: "#e5e7eb", color: "#374151" }}>
                            Sempre attivi
                          </span>
                        )}
                      </div>
                      <div
                        className="text-[12px] mt-0.5"
                        style={{ color: "#6b7280" }}>
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
              onClick={handleRejectAll}
              disabled={isPending}
              className="text-xs font-medium px-3 py-2 rounded-md transition-colors disabled:opacity-50"
              style={{ background: "#f3f4f6", color: "#374151" }}>
              Rifiuta tutti
            </button>
            <button
              type="button"
              onClick={handleSaveCustom}
              disabled={isPending}
              className="text-xs font-semibold px-3 py-2 rounded-md transition-colors disabled:opacity-50"
              style={{ background: "#374151", color: "#ffffff" }}>
              {isPending ? "Salvataggio…" : "Salva selezione"}
            </button>
            <button
              type="button"
              onClick={handleAcceptAll}
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
