"use client";
// lib/hooks/use-is-stuck.ts
//
// Hook che dice "l'elemento sticky è attualmente attaccato al top
// del suo scroll container?" — utile per applicare uno stato visuale
// diverso quando un header sticky entra in modalità "stuck".
//
// Pattern: si usa un piccolo <div ref={sentinelRef} /> PRIMA del
// componente sticky. IntersectionObserver guarda quel sentinel.
// Finché è visibile = utente non ha scrollato = stuck:false. Quando
// esce dalla viewport del SUO scroll container (scroll giù) = stuck:true.
//
// IMPORTANTE: l'observer trova automaticamente il primo antenato con
// `overflow-y: auto|scroll|overlay` e lo usa come `root`. Senza questo,
// in app con scroll container interno (es. `<main overflow-y-auto>`)
// l'observer di default osserva contro window viewport → toggle
// inaffidabile, può oscillare creando loop di scroll.
//
// Vantaggi vs scroll listener: niente eventi a 60fps, no jank.

import { useEffect, useRef, useState } from "react";

/**
 * Trova il primo antenato con `overflow-y: auto|scroll|overlay`. Da
 * usare come `root` di IntersectionObserver quando il documento è
 * scrollato dentro un container interno e non dalla window. Riusato
 * da FeedList per l'infinite scroll e da useIsStuck per i sticky.
 */
export function findScrollParent(node: Element | null): Element | null {
  let parent: Element | null = node?.parentElement ?? null;
  while (parent) {
    const style = window.getComputedStyle(parent);
    if (/(auto|scroll|overlay)/.test(style.overflowY)) return parent;
    parent = parent.parentElement;
  }
  return null;
}

export function useIsStuck<T extends HTMLElement = HTMLDivElement>(): {
  sentinelRef: React.RefObject<T | null>;
  isStuck: boolean;
} {
  const sentinelRef = useRef<T | null>(null);
  const [isStuck, setIsStuck] = useState(false);

  useEffect(() => {
    const target = sentinelRef.current;
    if (!target) return;

    const root = findScrollParent(target);

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        // Sentinel visibile = utente NON ha scrollato oltre = non stuck.
        setIsStuck(!entry.isIntersecting);
      },
      { root, threshold: 0, rootMargin: "0px 0px 0px 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  return { sentinelRef, isStuck };
}
