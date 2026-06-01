import type { Metadata } from "next";
import Link from "next/link";
import { getAllCatalogItems } from "@/lib/modules/rewards/catalog-queries";
import { buildAdminPath } from "@/lib/admin-paths";
import { CatalogToggleButton } from "./_components/catalog-toggle-button";

export const metadata: Metadata = { title: "Rewards / Catalog" };
export const dynamic = "force-dynamic";

export default async function RewardsCatalogPage() {
  const [items, newPath] = await Promise.all([
    getAllCatalogItems(),
    buildAdminPath("modules/rewards/catalog/new"),
  ]);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: "var(--admin-text)" }}>
            Catalog
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--admin-text-muted)" }}>
            Item acquistabili con GCC: badge e perk. L&apos;utente li acquista da /mycoins.
          </p>
        </div>
        <Link
          href={newPath}
          className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium"
          style={{ background: "var(--admin-accent)", color: "#fff" }}
        >
          + Nuovo item
        </Link>
      </header>

      {items.length === 0 ? (
        <div
          className="rounded-lg p-8 text-center"
          style={{ background: "var(--admin-card-bg)", border: "1px solid var(--admin-card-border)" }}
        >
          <p className="text-sm" style={{ color: "var(--admin-text-muted)" }}>
            Nessun item nel catalogo. Creane uno con &quot;+ Nuovo item&quot;.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(async (item) => {
            const editPath = await buildAdminPath(`modules/rewards/catalog/${item.id}`);
            return (
              <div
                key={item.id}
                className="rounded-lg p-4 flex items-center gap-4"
                style={{ background: "var(--admin-card-bg)", border: "1px solid var(--admin-card-border)" }}
              >
                {/* Icona preview */}
                <div
                  className="w-10 h-10 rounded-xl shrink-0 flex items-center justify-center overflow-hidden"
                  style={{ background: item.iconBg ?? "#888" }}
                >
                  {item.iconUrl ? (
                    <img src={item.iconUrl} alt={item.label} className="w-full h-full object-contain" />
                  ) : (
                    <span className="text-white text-lg font-bold">{item.label[0]}</span>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold" style={{ color: "var(--admin-text)" }}>
                      {item.label}
                    </span>
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase"
                      style={{ background: "var(--admin-page-bg)", color: "var(--admin-text-faint)" }}
                    >
                      {item.type}
                    </span>
                    {item.isLocked && (
                      <span
                        className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                        style={{ background: "var(--admin-page-bg)", color: "var(--admin-text-faint)" }}
                        title="Ha già redemptions — slug/type bloccati"
                      >
                        🔒 locked
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs" style={{ color: "var(--admin-text-muted)" }}>
                    <span className="font-mono">{item.slug}</span>
                    <span>{parseFloat(item.costGcc as unknown as string).toLocaleString("it-IT")} GCC</span>
                    <span>{item.redemptionCount} acquisti</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  <CatalogToggleButton id={item.id} isActive={item.isActive} />
                  <Link
                    href={editPath}
                    className="rounded-md px-2.5 py-1 text-xs font-medium"
                    style={{ background: "var(--admin-page-bg)", color: "var(--admin-text)", border: "1px solid var(--admin-card-border)" }}
                  >
                    Modifica
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
