"use client";
// Remove button per riga coin nella detail. Click → confirm inline
// (1 click "Conferma rimozione"). Niente modale separata per non
// appesantire — la riga sparisce subito grazie a revalidatePath.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { removeCoinAction } from "@/lib/modules/watchlist/actions";

type Props = {
  watchlistId: string;
  symbol: string;
  ariaLabel: string;
};

export function CoinRowRemove({ watchlistId, symbol, ariaLabel }: Props) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [_, startTransition] = useTransition();

  const onRemove = () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    startTransition(async () => {
      const res = await removeCoinAction(watchlistId, symbol);
      setConfirming(false);
      if (res.ok) router.refresh();
    });
  };

  return (
    <button
      type="button"
      onClick={onRemove}
      onBlur={() => setConfirming(false)}
      aria-label={ariaLabel}
      className={
        confirming
          ? "shrink-0 inline-flex items-center justify-center px-2 py-1 text-[11px] font-semibold rounded-md bg-gc-neg text-white hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-gc-line"
          : "shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-md text-gc-fg-3 hover:bg-gc-bg-3 hover:text-gc-fg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gc-line"
      }
    >
      {confirming ? "OK?" : <X size={14} aria-hidden />}
    </button>
  );
}
