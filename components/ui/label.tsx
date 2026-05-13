"use client";

import * as React from "react";
import { Label as LabelPrimitive } from "radix-ui";;

import { cn } from "@/lib/utils";

function Label({
  className,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        // text-gc-fg garantisce theme-awareness (sabbia: verde scuro, bosco: cream).
        // Senza, la Label eredita dal browser default (black) → in dark mode
        // le label sopra agli input diventano illeggibili. Vedi commit 10a7238.
        "flex items-center gap-2 text-sm leading-none font-medium select-none text-gc-fg group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}

export { Label };
