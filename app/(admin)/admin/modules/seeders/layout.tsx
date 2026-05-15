import { requireAdminSectionPage } from "@/lib/rbac/guards";
import type { Metadata } from "next";
import { Sprout } from "lucide-react";

export const metadata: Metadata = { title: "Seeders" };

export default async function SeedersModuleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminSectionPage("modules:seeders");
  return (
    <div className="space-y-5">
      <header>
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{
              background:
                "color-mix(in srgb, var(--admin-accent) 12%, var(--admin-card-bg))",
              border:
                "1px solid color-mix(in srgb, var(--admin-accent) 25%, transparent)",
            }}>
            <Sprout size={18} style={{ color: "var(--admin-accent)" }} />
          </div>
          <div className="flex-1 min-w-0">
            <h2
              className="text-lg font-bold"
              style={{ color: "var(--admin-text)" }}>
              Seeders
            </h2>
            <p
              className="text-sm mt-0.5"
              style={{ color: "var(--admin-text-faint)" }}>
              Popola il sito con utenti e contenuti demo. Account non
              loggabili, indistinguibili dal frontend, eliminabili in
              blocco col bottone Cleanup.
            </p>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
