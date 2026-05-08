// app/(admin)/admin/not-found.tsx
// Sovrascrive il 404 globale per tutte le route /admin/*.
// Viene wrappato automaticamente dal layout admin (sidebar + header).
import { getAdminUrlSlug } from "@/lib/admin-paths";
import Link from "next/link";
import { LayoutDashboard, SearchX } from "lucide-react";

export default async function AdminNotFound() {
  const adminSlug = await getAdminUrlSlug();
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6 gap-6">
      {/* Icona */}
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center"
        style={{
          background: "color-mix(in srgb, var(--admin-accent) 10%, var(--admin-card-bg))",
          border: "1px solid color-mix(in srgb, var(--admin-accent) 20%, transparent)",
        }}
      >
        <SearchX size={28} style={{ color: "var(--admin-accent)" }} />
      </div>

      {/* Testo */}
      <div className="space-y-2">
        <p
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: "var(--admin-accent)" }}
        >
          Errore 404
        </p>
        <h1
          className="text-2xl font-bold"
          style={{ color: "var(--admin-text)" }}
        >
          Pagina non trovata
        </h1>
        <p
          className="text-sm max-w-xs mx-auto"
          style={{ color: "var(--admin-text-muted)" }}
        >
          La sezione che stai cercando non esiste o è stata rimossa.
        </p>
      </div>

      {/* CTA */}
      <Link
        href={`/${adminSlug}`}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
        style={{
          background: "var(--admin-accent)",
          color: "#fff",
        }}
      >
        <LayoutDashboard size={15} />
        Torna alla Dashboard
      </Link>
    </div>
  );
}
