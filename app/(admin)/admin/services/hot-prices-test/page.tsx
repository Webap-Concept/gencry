// app/(admin)/admin/services/hot-prices-test/page.tsx
//
// Diagnostic page TEMPORANEA per il flow Redis-first prices.
// Mostra lo stato della chiave `prices:current:all` su Upstash, permette
// di scrivere un sample, forzare un cron run. Da rimuovere in PR4 quando
// arrivera' la UI completa /admin/services/exchanges.
import { requireAdminSectionPage } from "@/lib/rbac/guards";
import type { Metadata } from "next";
import { loadDiagnostics } from "./actions";
import { HotPricesClient } from "./_components/hot-prices-client";

export const metadata: Metadata = { title: "Hot prices diagnostics" };
export const dynamic = "force-dynamic";

export default async function HotPricesTestPage() {
  await requireAdminSectionPage("admin:users");
  const diag = await loadDiagnostics();
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-lg font-semibold" style={{ color: "var(--admin-text)" }}>
          Hot prices — diagnostics
        </h1>
        <p className="text-[12.5px] mt-0.5" style={{ color: "var(--admin-text-faint)" }}>
          Verifica end-to-end del flow Upstash hot layer. Mostra se la
          chiave <code>prices:current:all</code> esiste, quanto e&apos;
          vecchia, e permette di forzare un run del cron per popolare
          subito il payload.
        </p>
      </header>
      <HotPricesClient initialDiagnostics={diag} />
    </div>
  );
}
