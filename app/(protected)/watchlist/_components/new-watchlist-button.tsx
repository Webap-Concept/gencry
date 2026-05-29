"use client";
// Trigger + dialog "+ Nuova watchlist". Stato locale: open + form.
// In caso di success il dialog si chiude e Next revalida la lista (la
// server action chiama `revalidatePath('/watchlist')`).

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WatchlistFormDialog } from "./watchlist-form-dialog";

export function NewWatchlistButton({ label }: { label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        className="shrink-0"
      >
        <Plus size={16} aria-hidden />
        {label}
      </Button>
      <WatchlistFormDialog
        open={open}
        onOpenChange={setOpen}
        mode="create"
      />
    </>
  );
}
