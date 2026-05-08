"use client";

// Context per propagare lo slug URL admin (runtime, da app_settings) ai
// Client Component sotto l'area admin. Necessario perché la cartella file
// system è fissa `app/(admin)/admin/`, quindi `useParams()` non contiene
// `adminSlug` — il prefisso URL pubblico è gestito dal proxy.ts via
// rewrite invisibile, e va passato esplicitamente al client.
//
// Pattern:
//   - layout server (app/(admin)/admin/layout.tsx) chiama
//     `getAdminUrlSlug()` e wrappa i children con <AdminSlugProvider>.
//   - i Client Component sotto l'admin chiamano `useAdminSlug()`.

import { createContext, useContext } from "react";

const AdminSlugContext = createContext<string | null>(null);

export function AdminSlugProvider({
  value,
  children,
}: {
  value: string;
  children: React.ReactNode;
}) {
  return (
    <AdminSlugContext.Provider value={value}>
      {children}
    </AdminSlugContext.Provider>
  );
}

/** Ritorna lo slug URL admin corrente (es. "admin", "admincontrol"). Lancia
 *  se chiamato fuori da `<AdminSlugProvider>` — significa che il componente
 *  è stato renderizzato fuori dall'area admin. */
export function useAdminSlug(): string {
  const v = useContext(AdminSlugContext);
  if (v === null) {
    throw new Error(
      "[useAdminSlug] called outside <AdminSlugProvider>. Did you import this hook in a non-admin component?",
    );
  }
  return v;
}
