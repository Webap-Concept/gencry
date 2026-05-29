import { cva, type VariantProps } from "class-variance-authority";
import { Slot as SlotPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-offset-0",
  {
    variants: {
      variant: {
        // Arancio — CTA principale
        default:
          "bg-brand-primary text-white hover:bg-brand-primary-hover focus-visible:ring-primary/40",
        // Verde menta — azioni secondarie positive
        accent:
          "bg-accent text-white hover:bg-accent-hover focus-visible:ring-accent/40",
        // Secondary — CTA secondaria del tema: verde brand chiaro al posto
        // dell'arancio. `bg-brand-accent` (#7dbe9e) e' un brand color FISSO
        // in entrambi i temi → il testo va scuro fisso (#123928, verde
        // scuro brand) per contrasto, NON un token theme-aware.
        secondary:
          "bg-brand-accent text-[#123928] hover:bg-brand-accent-hover focus-visible:ring-brand-accent/40",
        // Outline — azioni secondarie neutre. Token-based per theme-awareness.
        outline:
          "border border-gc-line bg-gc-bg-2 text-gc-fg hover:bg-gc-bg-3 focus-visible:ring-gc-line",
        // Ghost — azioni terziarie. Hover usa il token bg-3 (più chiaro) per dare feedback visivo in entrambi i temi.
        ghost: "text-gc-fg hover:bg-gc-bg-3 focus-visible:ring-gc-line",
        // Destructive — azioni pericolose. Usa il token gc-neg perché
        // var(--destructive) è in formato HSL space-separated e in alcuni
        // contesti non viene wrappato in hsl(), risultando trasparente.
        destructive:
          "bg-gc-neg text-white hover:bg-[#a64635] focus-visible:ring-gc-neg/40",
        // Link
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2.5 has-[>svg]:px-3",
        sm: "h-8 gap-1.5 px-3 text-xs has-[>svg]:px-2.5",
        lg: "h-12 px-6 text-base has-[>svg]:px-4",
        icon: "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? SlotPrimitive.Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };

