"use client";
// lib/hooks/use-resetable-list-state.ts
//
// State per liste paginate che possono essere ri-fetchate dal server
// (es. cambio filter via URL searchParams). Risolve l'anti-pattern
// `useState(initial.X)` che legge la prop SOLO al primo mount:
//
//   ❌ useState(initial.rows)
//      → cambio filter, server invia nuove rows, client le ignora.
//
//   ✅ useResetableListState(initial)
//      → quando `initial` cambia identità, il state si reseta.
//
// Pattern: useState seeded da `initial` + useRef per detect change.
// Più robusto di `useEffect(() => setX(initial), [initial])`:
//   - applica il reset PRIMA del paint (niente flash di vecchio
//     contenuto)
//   - non racing con eventuali setX in-flight tra render
//
// Vedi feedback_initial_prop_state per il contesto e l'alternativa
// `key={filter}` su parent server.
//
// Tipo: T è la singola entry; la pagina è { rows: T[], nextCursor: string | null }.
import { useRef, useState } from "react";

export type ResetableListPage<T> = {
  rows: T[];
  nextCursor: string | null;
};

export type ResetableListState<T> = {
  rows: T[];
  cursor: string | null;
  /** Append nuove rows (es. dopo loadMore) preservando le esistenti. */
  appendRows: (more: T[], nextCursor: string | null) => void;
  /** Sostituisce TUTTE le rows con quelle nuove. Raro: dopo una mutation
   *  che ha riordinato il dataset, di solito basta router.refresh(). */
  replaceRows: (rows: T[], nextCursor: string | null) => void;
};

export function useResetableListState<T>(
  initial: ResetableListPage<T>,
): ResetableListState<T> {
  // Inizializzazione standard al mount.
  const [rows, setRows] = useState<T[]>(initial.rows);
  const [cursor, setCursor] = useState<string | null>(initial.nextCursor);

  // Detect cambio identità della prop `initial`. Se cambia, reseta lo
  // state SINCRONICAMENTE in render (no useEffect → no doppio paint).
  // Sicuro per React rules: setState durante render con confronto del
  // prev value è un pattern documentato (vedi docs "Storing information
  // from previous renders").
  const initialRef = useRef(initial);
  if (initialRef.current !== initial) {
    initialRef.current = initial;
    setRows(initial.rows);
    setCursor(initial.nextCursor);
  }

  return {
    rows,
    cursor,
    appendRows: (more, nextCursor) => {
      setRows((prev) => [...prev, ...more]);
      setCursor(nextCursor);
    },
    replaceRows: (next, nextCursor) => {
      setRows(next);
      setCursor(nextCursor);
    },
  };
}
