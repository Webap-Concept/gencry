"use client";
// components/auth/ViewerProvider.tsx
//
// Single source of truth client-side per "chi sta visualizzando questa
// pagina". Mounted nel root layout (`app/layout.tsx`) wrap di tutto
// l'albero React. Il valore viene popolato server-side dalla sessione
// e propagato come prop iniziale al provider.
//
// Niente fetch client → niente loading state → niente flicker. Quando
// l'utente fa login/logout, la nuova session si propaga al prossimo
// router.refresh() o full reload (i Server Component si re-render con
// nuovo viewer).
//
// API:
//   - `useViewer()` → { isLoggedIn, userId, displayName }
//     Letto da qualunque client component senza prop drilling.
//
// Convenzione: tutti i nuovi componenti che dipendono dallo stato
// anon/loggato usano `useViewer()`. Niente più prop ad-hoc tipo
// `isAuthed` / `viewerLoggedOut` / `isLoggedIn` sparsi.
import { createContext, useContext, type ReactNode } from "react";

export interface Viewer {
  /** True se l'utente è loggato (sessione valida). */
  isLoggedIn: boolean;
  /** UserId o null se anon. Usato per confronti `isAuthor` ecc. */
  userId: string | null;
  /** Display name (firstName lastName || username), null se anon. */
  displayName: string | null;
}

const ANON_VIEWER: Viewer = {
  isLoggedIn: false,
  userId: null,
  displayName: null,
};

const ViewerContext = createContext<Viewer>(ANON_VIEWER);

export function ViewerProvider({
  viewer,
  children,
}: {
  viewer: Viewer;
  children: ReactNode;
}) {
  return (
    <ViewerContext.Provider value={viewer}>{children}</ViewerContext.Provider>
  );
}

/**
 * Hook client per leggere lo stato del viewer. Funziona anche senza
 * Provider esplicito (ritorna ANON_VIEWER come fallback) — ma in
 * pratica il Provider è sempre montato dal root layout.
 */
export function useViewer(): Viewer {
  return useContext(ViewerContext);
}
