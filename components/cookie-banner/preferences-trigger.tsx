"use client";

import type { BannerServicesByCategory } from "@/lib/db/cookie-services-queries";
import { Cookie } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
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
  /** Servizi attivi raggruppati per categoria, prefetched server-side. */
  services?: BannerServicesByCategory;
  variant?: "link" | "button";
  label?: string;
  className?: string;
};

export function CookiePreferencesTrigger({
  initialPrefs,
  policyUrl,
  services,
  variant = "link",
  label = "Preferenze cookie",
  className,
}: Props) {
  const [open, setOpen] = useState(false);

  if (variant === "button") {
    return (
      <>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setOpen(true)}
          className={className}
        >
          <Cookie size={14} />
          {label}
        </Button>
        {open && (
          <CookieCustomizeModal
            initialPrefs={initialPrefs}
            policyUrl={policyUrl}
            services={services}
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
          services={services}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
