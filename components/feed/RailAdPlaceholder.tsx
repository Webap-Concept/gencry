// components/feed/RailAdPlaceholder.tsx
//
// Mockup section per la right rail. Verrà sostituita dalla vera entry
// pubblicitaria / widget quando arriva. Vive nel registry come una
// qualsiasi altra HomeSection — vedi lib/home/core-sections.ts.
//
// Server component: nessuno state, nessun client interaction.

import { Megaphone } from "lucide-react";

export function RailAdPlaceholder() {
  return (
    <article className="rounded-gc border border-gc-line bg-gc-bg-2 p-4 flex flex-col gap-2.5">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.08em] text-gc-fg-3">
        <Megaphone size={11} strokeWidth={1.7} />
        Spazio pubblicitario
      </div>
      <h3 className="font-display text-[16px] leading-tight text-gc-fg">
        Mockup placeholder
      </h3>
      <p className="text-[12.5px] text-gc-fg-2 leading-snug">
        Qui andranno le card sponsor / widget reali quando arriveranno
        come sezioni registrate nello slot{" "}
        <code className="font-mono text-[11.5px] text-gc-fg-3">home.rail.top</code>.
      </p>
    </article>
  );
}

/**
 * Skeleton "fedele" alla card finale: stessa shape, blocchi grigi animati.
 * Esempio dimostrativo del pattern HomeSection.Skeleton — ogni futura
 * sezione del registry dovrebbe definire il suo skeleton così, per non
 * far saltare il layout durante il loading iniziale.
 */
export function RailAdPlaceholderSkeleton() {
  return (
    <article className="rounded-gc border border-gc-line bg-gc-bg-2 p-4 flex flex-col gap-2.5 animate-pulse">
      <div className="h-3 w-32 rounded bg-gc-bg-3" />
      <div className="h-4 w-40 rounded bg-gc-bg-3 mt-1" />
      <div className="h-2.5 w-full rounded bg-gc-bg-3" />
      <div className="h-2.5 w-3/4 rounded bg-gc-bg-3" />
    </article>
  );
}
