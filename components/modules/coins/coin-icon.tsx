"use client";

// components/modules/coins/coin-icon.tsx
// Icona coin: img su R2 con fallback alla prima lettera del simbolo.
// Pure presentational, riusabile in card / list / inline. È `use client`
// per gestire il fallback se l'<img> 404 a runtime (R2 perso, asset
// cancellato): senza, l'utente vedrebbe la broken-icon del browser.
import { useState } from "react";
import { cn } from "@/lib/utils";

const SIZE_MAP = {
  sm: { box: "w-6 h-6", text: "text-[10px]", px: 24 },
  md: { box: "w-8 h-8", text: "text-xs", px: 32 },
  lg: { box: "w-10 h-10", text: "text-sm", px: 40 },
  xl: { box: "w-14 h-14", text: "text-lg", px: 56 },
} as const;

export function CoinIcon({
  symbol,
  imageUrl,
  size = "md",
  className,
}: {
  symbol: string;
  imageUrl: string | null;
  size?: keyof typeof SIZE_MAP;
  className?: string;
}) {
  const { box, text, px } = SIZE_MAP[size];
  const [errored, setErrored] = useState(false);

  if (!imageUrl || errored) {
    return (
      <span
        className={cn(
          box,
          text,
          "inline-flex items-center justify-center rounded-full font-semibold uppercase shrink-0 bg-gc-bg-3 text-gc-fg-2 border border-gc-line",
          className,
        )}
        aria-hidden>
        {symbol.charAt(0)}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={imageUrl}
      alt=""
      aria-hidden
      width={px}
      height={px}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setErrored(true)}
      className={cn(box, "rounded-full shrink-0 object-cover", className)}
    />
  );
}
