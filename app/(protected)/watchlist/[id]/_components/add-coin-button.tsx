"use client";
// Trigger button del dialog "Aggiungi coin".
//
// `autoOpen` viene dalla querystring `?add=1` (la card vuota della
// lista naviga qui con quel param per atterrare con la modale gia'
// aperta). Sul mount apriamo la modale e ripuliamo l'URL via
// `history.replaceState` cosi' un refresh non riapre.

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddCoinDialog } from "./add-coin-dialog";

export function AddCoinButton({
  watchlistId,
  label,
  autoOpen = false,
}: {
  watchlistId: string;
  label: string;
  autoOpen?: boolean;
}) {
  const [open, setOpen] = useState(autoOpen);

  useEffect(() => {
    if (!autoOpen) return;
    // Cleanup querystring senza re-render (router.replace triggererebbe
    // un round-trip RSC inutile sulla stessa rotta).
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (url.searchParams.has("add")) {
        url.searchParams.delete("add");
        window.history.replaceState(null, "", url.pathname + url.search);
      }
    }
  }, [autoOpen]);

  return (
    <>
      <Button
        type="button"
        size="sm"
        onClick={() => setOpen(true)}
      >
        <Plus size={14} aria-hidden />
        {label}
      </Button>
      <AddCoinDialog
        watchlistId={watchlistId}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
