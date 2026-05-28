"use client";
// Trigger button del dialog "Aggiungi coin".

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddCoinDialog } from "./add-coin-dialog";

export function AddCoinButton({
  watchlistId,
  label,
}: {
  watchlistId: string;
  label: string;
}) {
  const [open, setOpen] = useState(false);
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
