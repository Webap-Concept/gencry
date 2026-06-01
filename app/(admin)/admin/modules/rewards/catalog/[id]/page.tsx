import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { buildAdminPath } from "@/lib/admin-paths";
import { getCatalogItem } from "@/lib/modules/rewards/catalog-queries";
import { CatalogForm } from "../_components/catalog-form";

export const metadata: Metadata = { title: "Rewards / Modifica item" };
export const dynamic = "force-dynamic";

export default async function EditCatalogItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [item, backPath] = await Promise.all([
    getCatalogItem(id),
    buildAdminPath("modules/rewards/catalog"),
  ]);
  if (!item) notFound();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold" style={{ color: "var(--admin-text)" }}>
          Modifica — {item.label}
        </h1>
        {item.isLocked && (
          <p className="text-xs mt-1 px-2 py-1 rounded" style={{ background: "var(--admin-page-bg)", color: "var(--admin-text-muted)" }}>
            🔒 Item con acquisti esistenti ({item.redemptionCount}): slug, tipo e perk_data sono bloccati.
          </p>
        )}
      </header>
      <CatalogForm item={item} backPath={backPath} />
    </div>
  );
}
