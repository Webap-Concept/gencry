"use client";
// components/social-graph/FollowOverridesProvider.tsx
//
// Client Context che tiene in memoria gli override locali del follow
// state per-authorId. Risolve l'inconsistenza visiva quando due
// PostCard nello stesso feed sono dello stesso autore: dopo Follow su
// uno, anche l'altro deve mostrare "Segui già" senza refresh.
//
// Architettura:
//   - 1 Map<authorId, boolean> mutata via setFollow.
//   - useFollowOverride(authorId, initial) → ritorna l'override se
//     presente, altrimenti `initial` (tipicamente il prop SSR
//     viewerIsFollowingAuthor).
//   - useSetFollowOverride() → setter; chiamato dal FollowButton dopo
//     un follow/unfollow andato a buon fine.
//
// Default no-op fuori dal Provider: il FollowButton e il PostCard
// funzionano anche senza wrapper (chiamata = noop, lettura = initial).
// Questo evita di forzare la presenza del Provider in ogni call site
// custom (es. SuggestedFollowsRow renderizzata fuori dal feed).
//
// Il provider e' montato a livello globale in app/layout.tsx — un'unica
// istanza per session, niente per-page.
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

type FollowOverridesValue = {
  overrides: ReadonlyMap<string, boolean>;
  setFollow: (authorId: string, following: boolean) => void;
};

const NOOP_VALUE: FollowOverridesValue = {
  overrides: new Map<string, boolean>(),
  setFollow: () => {},
};

const FollowOverridesContext =
  createContext<FollowOverridesValue>(NOOP_VALUE);

export function FollowOverridesProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [overrides, setOverrides] = useState<Map<string, boolean>>(
    () => new Map(),
  );

  const setFollow = useCallback(
    (authorId: string, following: boolean) => {
      setOverrides((prev) => {
        const current = prev.get(authorId);
        if (current === following) return prev;
        const next = new Map(prev);
        next.set(authorId, following);
        return next;
      });
    },
    [],
  );

  const value = useMemo<FollowOverridesValue>(
    () => ({ overrides, setFollow }),
    [overrides, setFollow],
  );

  return (
    <FollowOverridesContext.Provider value={value}>
      {children}
    </FollowOverridesContext.Provider>
  );
}

/**
 * Stato corrente del follow del viewer verso `authorId`.
 *   - se il Context ha un override per quell'authorId → ritorna l'override
 *     (es. il bottone Follow appena cliccato su un altro post dello
 *     stesso autore).
 *   - altrimenti ritorna `initial` (il valore SSR-dato).
 *
 * Safe outside provider: il default Context e' una Map vuota → ritorna
 * sempre `initial`.
 */
export function useFollowOverride<T extends boolean | undefined>(
  authorId: string,
  initial: T,
): T | boolean {
  const ctx = useContext(FollowOverridesContext);
  const override = ctx.overrides.get(authorId);
  if (override === undefined) return initial;
  return override;
}

/**
 * Setter per registrare un override. Chiamato dal FollowButton dopo
 * un follow/unfollow ok. Fuori dal Provider e' no-op.
 */
export function useSetFollowOverride(): (
  authorId: string,
  following: boolean,
) => void {
  return useContext(FollowOverridesContext).setFollow;
}

/**
 * Esposizione della Map intera (read-only). Consumer (es.
 * HomeNewPostsBanner) la usano per ricomputare un Set live combinando
 * stato SSR + override di sessione. Re-renders quando il setter
 * triggera un cambio (referential equality nuova Map → useMemo
 * invalida nei consumer).
 */
export function useFollowOverridesMap(): ReadonlyMap<string, boolean> {
  return useContext(FollowOverridesContext).overrides;
}
