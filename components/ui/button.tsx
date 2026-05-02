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
        // Outline sabbia — azioni secondarie neutre
        outline:
          "border border-border bg-surface text-[#2C2416] hover:bg-[#F5F0E8] focus-visible:ring-border",
        // Ghost — azioni terziarie
        ghost: "text-label hover:bg-[#F5F0E8] focus-visible:ring-border",
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
        sm: "h-8 rounded-lg gap-1.5 px-3 text-xs has-[>svg]:px-2.5",
        lg: "h-12 rounded-xl px-6 text-base has-[>svg]:px-4",
        icon: "size-10 rounded-xl",
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

