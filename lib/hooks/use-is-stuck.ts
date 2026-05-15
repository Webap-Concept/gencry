"use client";
// lib/hooks/use-is-stuck.ts
//
// Hook che dice "l'elemento sticky è attualmente attaccato al top
// della viewport?" — utile per applicare uno stato visuale diverso
// quando un header sticky entra in modalità "stuck".
//
// Pattern: si usa un piccolo <div ref={sentinelRef} /> PRIMA del
// componente sticky. IntersectionObserver guarda quel sentinel.
// Finché è visibile = utente non ha scrollato = stuck:false. Quando
// esce dalla viewport (scroll giù) = stuck:true.
//
// Vantaggi vs scroll listener: niente eventi a 60fps, no jank,
// browser ottimizza.

import { useEffect, useRef, useState } from "react";

export function useIsStuck<T extends HTMLElement = HTMLDivElement>(): {
  sentinelRef: React.RefObject<T | null>;
  isStuck: boolean;
} {
  const sentinelRef = useRef<T | null>(null);
  const [isStuck, setIsStuck] = useState(false);

  useEffect(() => {
    const target = sentinelRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        // Sentinel visibile = utente NON ha scrollato oltre = non stuck.
        setIsStuck(!entry.isIntersecting);
      },
      { threshold: 0, rootMargin: "0px 0px 0px 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  return { sentinelRef, isStuck };
}
