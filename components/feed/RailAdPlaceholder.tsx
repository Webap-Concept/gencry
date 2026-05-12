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
