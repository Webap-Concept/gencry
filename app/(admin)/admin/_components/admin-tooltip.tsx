"use client";
// app/(admin)/admin/_components/admin-tooltip.tsx
//
// Wrapper convenience sopra le primitive shadcn `<Tooltip>` per il
// pannello admin (analogo a AdminDialog → AdminDialog wrappa shadcn
// Dialog, AdminTooltip wrappa shadcn Tooltip).
//
// REGOLA: in /admin/** ogni icona-cliccabile SENZA testo (azioni
// inline su tabelle/card/toolbar) deve essere wrappata in
// `<AdminTooltip label="...">` per dare al keyboard-only user e a
// chi non riconosce l'icona un hint testuale. Niente `title=""`
// native (no keyboard focus, mobile, no theming, flicker su hover).
//
// Stile: background slate-900 (#0f172a) + testo bianco — coerente
// nel theme admin sabbia e leggibile su qualunque sfondo.
//
// Esempio:
//   <AdminTooltip label="Modifica pagina">
//     <button onClick={onEdit}><Pencil size={14} /></button>
//   </AdminTooltip>
//
// Il TooltipProvider (delay 200ms / skipDelay 300ms) vive in
// admin-shell-client.tsx — i consumer non devono montarne uno proprio.
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ReactNode } from "react";

type Side = "top" | "right" | "bottom" | "left";

export function AdminTooltip({
  label,
  children,
  side = "top",
  sideOffset = 6,
  delayDuration,
}: {
  label: ReactNode;
  children: ReactNode;
  side?: Side;
  sideOffset?: number;
  /** Per-instance override; default = provider value (200ms). */
  delayDuration?: number;
}) {
  return (
    <Tooltip delayDuration={delayDuration}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent
        side={side}
        sideOffset={sideOffset}
        // Override delle classi shadcn default (`bg-foreground
        // text-background`) per fissare slate-900/white indipendentemente
        // dal tema. Le classi `!` vincono via tailwind-merge.
        className="!bg-slate-900 !text-white px-2 py-1 text-[11px] font-medium rounded-md shadow-md select-none">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
