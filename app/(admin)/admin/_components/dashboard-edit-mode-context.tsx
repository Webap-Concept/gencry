"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { WidgetItem } from "@/lib/admin/dashboard/types";

interface DashboardEditModeContextValue {
  /** Whether the user is currently editing the layout. */
  editMode: boolean;
  /** Items as they currently are on screen — either the saved layout
   *  (when not editing) or the in-progress draft (when editing). */
  items: ReadonlyArray<WidgetItem>;
  enterEdit: () => void;
  /** Replace the working draft (called by the grid on every drag/resize). */
  setDraft: (items: WidgetItem[]) => void;
  /** Discard the draft and exit edit mode. */
  cancel: () => void;
  /** Persist the draft as the new layout (caller is responsible for the
   *  server roundtrip; this just exits edit mode + updates local state). */
  commit: () => void;
}

const Ctx = createContext<DashboardEditModeContextValue | null>(null);

export function DashboardEditModeProvider({
  initialItems,
  children,
}: {
  initialItems: ReadonlyArray<WidgetItem>;
  children: ReactNode;
}) {
  const [editMode, setEditMode] = useState(false);
  const [items, setItems] = useState<WidgetItem[]>(() => [...initialItems]);

  // Sync ONLY when `initialItems` actually changes (new data from the
  // server, e.g. after router.refresh() following a save).
  //
  // Why this no longer depends on `editMode`: when commit() flips
  // editMode false the server fetch triggered by router.refresh() is
  // still in flight, so `initialItems` still reflects the pre-save
  // layout. If this effect re-ran on the editMode transition it would
  // overwrite the just-saved draft with stale initialItems, making the
  // dashboard "snap back" to the previous layout for a moment — the
  // "stuck on save / had to refresh" symptom the user reported.
  //
  // cancel() handles its own reset to initialItems; commit() leaves the
  // draft as-is and trusts this effect to pick up the new initialItems
  // when the server-refreshed render lands.
  useEffect(() => {
    setItems([...initialItems]);
  }, [initialItems]);

  const enterEdit = useCallback(() => setEditMode(true), []);
  const setDraft = useCallback((next: WidgetItem[]) => setItems(next), []);
  const cancel = useCallback(() => {
    setItems([...initialItems]);
    setEditMode(false);
  }, [initialItems]);
  const commit = useCallback(() => setEditMode(false), []);

  return (
    <Ctx.Provider value={{ editMode, items, enterEdit, setDraft, cancel, commit }}>
      {children}
    </Ctx.Provider>
  );
}

export function useDashboardEditMode(): DashboardEditModeContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error(
      "useDashboardEditMode must be used inside <DashboardEditModeProvider>",
    );
  }
  return ctx;
}
