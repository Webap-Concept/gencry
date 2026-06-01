"use client";
// Trigger + dialog "+ Nuova watchlist". Stato locale: open + form.
// In caso di success il dialog si chiude e Next revalida la lista (la
// server action chiama `revalidatePath('/watchlist')`).
//
// Quando l'utente ha raggiunto il cap (used >= cap, non-Pro) il bottone è
// disabilitato e un tooltip spiega perché (elimina una / compra slot GCC).
// Il trigger DB resta comunque il backstop definitivo.

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { WatchlistFormDialog } from "./watchlist-form-dialog";

export function NewWatchlistButton({
  label,
  disabled = false,
  disabledTooltip,
}: {
  label: string;
  disabled?: boolean;
  disabledTooltip?: string;
}) {
  const [open, setOpen] = useState(false);

  const button = (
    <Button
      type="button"
      onClick={() => {
        if (!disabled) setOpen(true);
      }}
      disabled={disabled}
      className="shrink-0"
    >
      <Plus size={16} aria-hidden />
      {label}
    </Button>
  );

  return (
    <>
      {disabled && disabledTooltip ? (
        <TooltipProvider>
          <Tooltip>
            {/* span wrapper: il Button disabled ha pointer-events:none, gli
                eventi hover/focus risalgono allo span che fa da trigger. */}
            <TooltipTrigger asChild>
              <span tabIndex={0} className="inline-flex shrink-0">
                {button}
              </span>
            </TooltipTrigger>
            <TooltipContent>{disabledTooltip}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        button
      )}
      <WatchlistFormDialog open={open} onOpenChange={setOpen} mode="create" />
    </>
  );
}
