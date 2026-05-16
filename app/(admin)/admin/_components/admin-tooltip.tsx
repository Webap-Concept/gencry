"use client";
// app/(admin)/admin/_components/admin-tooltip.tsx
//
// Wrapper convenience per le primitive `<Tooltip>` di shadcn nel
// pannello admin. Per Tooltip/TooltipTrigger riusiamo shadcn (mantengono
// il TooltipProvider mountato in admin-shell-client). Per Content/Arrow
// usiamo direttamente Radix: la shadcn TooltipContent ha un arrow
// "diamante" (div ruotato + translate-y negativo) che si tucca dentro
// il body invece di sporgere → no triangolino visibile. L'Arrow Radix
// è un SVG triangolo standard che funziona affidabile in ogni side.
//
// REGOLA: in /admin/** ogni icona-cliccabile SENZA testo va wrappata
// in `<AdminTooltip label="...">` — vedi feedback_admin_tooltip_primitive.
//
// Stile: background slate-900 (#0f172a) + testo bianco + arrow stesso
// colore. Esplicito (non theme-derived) per essere coerente in
// light/dark e leggibile su qualsiasi sfondo admin.
import { Tooltip, TooltipTrigger } from "@/components/ui/tooltip";
import { Tooltip as TooltipPrimitive } from "radix-ui";
import type { ReactNode } from "react";

type Side = "top" | "right" | "bottom" | "left";

const TOOLTIP_BG = "#0f172a"; // tailwind slate-900

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
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={sideOffset}
          className="z-50 px-2 py-1 text-[11px] font-medium rounded-md shadow-md select-none animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
          style={{ background: TOOLTIP_BG, color: "#fff", maxWidth: 240 }}>
          {label}
          <TooltipPrimitive.Arrow
            width={10}
            height={5}
            style={{ fill: TOOLTIP_BG }}
          />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </Tooltip>
  );
}
