import { cn } from "@/lib/utils";
import * as React from "react";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        // Base
        "flex h-10 w-full min-w-0 rounded-full border px-4 py-2.5 text-sm",
        "bg-brand-surface-card text-brand-text placeholder:text-brand-text-light",
        // Bordo default
        "border-brand-border",
        // Focus — verde menta
        "outline-none transition-colors",
        "focus-visible:rounded-full focus-visible:ring-2 focus-visible:ring-[rgba(var(--brand-border-focus-rgb),0.2)] focus-visible:ring-offset-0",
        // Stato errore
        "aria-invalid:border-brand-error-border aria-invalid:ring-2 aria-invalid:ring-brand-error-border/20",
        // Disabled
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        // File input
        "file:text-brand-text file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium",
        className,
      )}
      {...props}
    />
  );
}

export { Input };

