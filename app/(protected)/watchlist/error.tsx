"use client";
// Error boundary per /watchlist. Difensivo: se getMyWatchlists o
// resolveCoinViews lanciano, mostriamo un fallback minimal con retry.
// Niente Sentry custom — l'inizializzazione globale e' gia' attiva.

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[watchlist] page error", error);
  }, [error]);

  return (
    <div className="max-w-5xl mx-auto py-6 px-4">
      <div className="bg-gc-bg-2 border border-gc-line rounded-2xl p-8 text-center flex flex-col items-center gap-3">
        <h2 className="text-lg font-serif text-gc-fg">
          Qualcosa è andato storto
        </h2>
        <p className="text-sm text-gc-fg-3 max-w-md">
          Non siamo riusciti a caricare le tue watchlist. Riprova.
        </p>
        <Button onClick={() => reset()} size="sm" className="mt-2">
          Riprova
        </Button>
      </div>
    </div>
  );
}
