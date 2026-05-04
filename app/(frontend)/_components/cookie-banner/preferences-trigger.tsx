"use client";

import { Cookie } from "lucide-react";
import { useState } from "react";
import {
  CookieCustomizeModal,
  type CustomizeInitialPrefs,
} from "./customize-modal";

/**
 * Bottone "Preferenze cookie" + modale di personalizzazione.
 *
 * Riusato in:
 *   - footer pubblico (per visitatori anonimi e loggati nel frontend pubblico)
 *   - /settings/privacy (per utenti loggati)
 *
 * Le preferenze attuali vanno passate via `initialPrefs` per pre-compilare
 * i toggle quando l'utente apre il modale per *modificare* (non per
 * decidere la prima volta). Il salvataggio passa per le stesse server
 * action del banner — niente duplicazione di logica lato server.
 *
 * `variant`:
 *   - "link"  → link compatto stile testo (per il footer)
 *   - "button"→ pulsante riquadrato (per le card di settings)
 */

type Props = {
  initialPrefs?: CustomizeInitialPrefs;
  policyUrl?: string | null;
  variant?: "link" | "button";
  label?: string;
  className?: string;
};

export function CookiePreferencesTrigger({
  initialPrefs,
  policyUrl,
  variant = "link",
  label = "Preferenze cookie",
  className,
}: Props) {
  const [open, setOpen] = useState(false);

  if (variant === "button") {
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={
            className ??
            "inline-flex items-center gap-1.5 rounded-lg border border-gc-line bg-gc-bg-2 px-3 py-2 text-[13px] font-medium text-gc-fg transition-colors hover:bg-gc-bg"
          }>
          <Cookie size={14} />
          {label}
        </button>
        {open && (
          <CookieCustomizeModal
            initialPrefs={initialPrefs}
            policyUrl={policyUrl}
            onClose={() => setOpen(false)}
          />
        )}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ??
          "inline-flex items-center gap-1 text-[12.5px] underline-offset-2 hover:underline"
        }
        style={{ color: "inherit" }}>
        <Cookie size={13} />
        {label}
      </button>
      {open && (
        <CookieCustomizeModal
          initialPrefs={initialPrefs}
          policyUrl={policyUrl}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
