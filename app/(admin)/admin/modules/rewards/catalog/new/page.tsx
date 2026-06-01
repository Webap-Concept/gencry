import type { Metadata } from "next";
import { buildAdminPath } from "@/lib/admin-paths";
import { CatalogForm } from "../_components/catalog-form";

export const metadata: Metadata = { title: "Rewards / Nuovo item" };

export default async function NewCatalogItemPage() {
  const backPath = await buildAdminPath("modules/rewards/catalog");
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold" style={{ color: "var(--admin-text)" }}>
          Nuovo item catalogo
        </h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--admin-text-muted)" }}>
          Crea un badge o un perk acquistabile dagli utenti con GCC.
        </p>
      </header>
      <CatalogForm backPath={backPath} />
    </div>
  );
}
