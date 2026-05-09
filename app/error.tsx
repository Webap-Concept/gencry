"use client";

import { useEffect, useState } from "react";

// Errori scatenati dal browser quando un chunk JS/CSS hashato non esiste
// più sul server (tipico dopo un deploy mentre l'utente ha tab aperti).
// Il fix è semplicemente ricaricare la pagina: l'HTML nuovo include i
// nomi dei chunk aggiornati e il browser reidrata pulito.
//
// Rilevati per nome o messaggio perché il tipo concreto varia tra
// browser/bundler: webpack lancia `ChunkLoadError`, Next 16 con Turbopack
// lancia `Failed to fetch dynamically imported module`, e i chunk CSS
// arrivano come `Loading CSS chunk N failed`.
function isStaleChunkError(error: Error): boolean {
  const name = error.name || "";
  const msg = error.message || "";
  return (
    name === "ChunkLoadError" ||
    /Loading chunk [\w-]+ failed/i.test(msg) ||
    /Loading CSS chunk [\w-]+ failed/i.test(msg) ||
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg)
  );
}

const RELOAD_FLAG = "gc-error-stale-chunk-reloaded";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Recovery automatico per stale chunk dopo deploy. Reload una volta
  // sola per sessione: se l'errore si ripresenta dopo il reload, è un
  // bug vero (chunk realmente rotto) e va mostrata la UI normale,
  // altrimenti finiremmo in reload-loop.
  const [recovering, setRecovering] = useState(() => {
    if (typeof window === "undefined") return false;
    if (!isStaleChunkError(error)) return false;
    try {
      if (sessionStorage.getItem(RELOAD_FLAG) === "1") return false;
      sessionStorage.setItem(RELOAD_FLAG, "1");
    } catch {
      // sessionStorage bloccato (Safari ITP, privacy mode): meglio non
      // tentare il reload automatico — rischio loop. Mostra la UI.
      return false;
    }
    return true;
  });

  useEffect(() => {
    if (recovering) {
      window.location.reload();
      return;
    }
    // Log to console in development; replace with Sentry/similar in production
    console.error("[GlobalError]", error);
  }, [error, recovering]);

  if (recovering) {
    // Schermo neutro mentre il reload parte: evita il flash della UI di
    // errore quando sappiamo che la pagina sta per ricaricarsi.
    return <div className="min-h-dvh bg-brand-bg" aria-hidden />;
  }

  return (
    <div className="min-h-dvh flex items-center justify-center px-4 bg-brand-bg">
      <div className="w-full max-w-md text-center space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-brand-text">
            Qualcosa è andato storto
          </h1>
          <p className="text-sm text-brand-text-muted">
            Si è verificato un errore imprevisto. Riprova o contatta il supporto
            se il problema persiste.
          </p>
          {error.digest && (
            <p className="text-xs text-brand-text-faint font-mono">
              Codice errore: {error.digest}
            </p>
          )}
        </div>
        <div className="flex justify-center gap-3">
          <button
            onClick={() => {
              // Per stale chunk il reset() di Next ritenta lo stesso fetch
              // fallito → stesso errore. Hard reload è l'unica via d'uscita.
              if (isStaleChunkError(error)) {
                window.location.reload();
              } else {
                reset();
              }
            }}
            className="px-5 py-2 rounded-full text-sm font-semibold bg-brand-primary text-white hover:bg-brand-primary-hover transition-colors">
            Riprova
          </button>
          <a
            href="/"
            className="px-5 py-2 rounded-full text-sm font-semibold border border-brand-border text-brand-text hover:bg-brand-surface transition-colors">
            Torna alla home
          </a>
        </div>
      </div>
    </div>
  );
}
