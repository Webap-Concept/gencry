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

  // Sync external changes (e.g. router.refresh() after a save brings new
  // initialItems from the server) into local state, but only when not
  // editing — we don't want to clobber an in-progress draft.
  useEffect(() => {
    if (!editMode) {
      setItems([...initialItems]);
    }
  }, [initialItems, editMode]);

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
