"use client";

// app/(cms)/_components/reset-scroll-on-path.tsx
//
// Force scroll-to-top quando cambia il pathname sul frontend pubblico.
//
// Perché serve nonostante Next provi a farlo da solo:
//   1. Il browser ha `history.scrollRestoration = 'auto'` di default e
//      ripristina la posizione precedente quando torni su una pagina
//      visitata. Su navigation NUOVA dovrebbe scrollare a top ma in
//      certi casi (App Router + transizioni async + container con
//      overflow) la posizione persiste.
//   2. Lo scroll container può essere `window`, `document.documentElement`
//      o `document.body` a seconda del browser. Resettarli tutti e tre
//      è cheap e copre Safari/Chrome/Firefox/iOS.
//   3. `useLayoutEffect` esegue PRIMA del paint, così l'utente non vede
//      mai il flash della posizione vecchia.

import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect } from "react";

// useLayoutEffect su SSR avverte; selezioniamo a runtime per evitare warning.
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

export function ResetScrollOnPath() {
  const pathname = usePathname();

  // Disabilita la scroll restoration nativa del browser una volta sola
  // al mount: non vogliamo che torni alla posizione precedente quando
  // navigiamo a una pagina già visitata.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if ("scrollRestoration" in window.history) {
      const prev = window.history.scrollRestoration;
      window.history.scrollRestoration = "manual";
      return () => {
        window.history.scrollRestoration = prev;
      };
    }
  }, []);

  useIsomorphicLayoutEffect(() => {
    if (typeof window === "undefined") return;
    // Multi-target: copre tutte le configurazioni "documento scrollabile".
    window.scrollTo(0, 0);
    if (document.documentElement) document.documentElement.scrollTop = 0;
    if (document.body) document.body.scrollTop = 0;
  }, [pathname]);

  return null;
}
