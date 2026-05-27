// app/(admin)/admin/services/binance-test/page.tsx
//
// Test page TEMPORANEA per validare l'adapter Binance prima di
// integrarlo nel cron (PR2). Sara' sostituita in PR4 dalla UI completa
// /admin/services/exchanges con CRUD + healthCheck per ogni adapter del
// registry.
//
// 3 azioni manuali: current prices (BTC/ETH/SOL), historical klines
// (BTCUSDT, range selezionabile), health ping.
import { requireAdminSectionPage } from "@/lib/rbac/guards";
import type { Metadata } from "next";
import { BinanceTestClient } from "./_components/binance-test-client";

export const metadata: Metadata = { title: "Binance test" };
export const dynamic = "force-dynamic";

export default async function BinanceTestPage() {
  await requireAdminSectionPage("admin:users");
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-lg font-semibold" style={{ color: "var(--admin-text)" }}>
          Binance adapter — test page
        </h1>
        <p className="text-[12.5px] mt-0.5" style={{ color: "var(--admin-text-faint)" }}>
          Verifica live che l&apos;adapter risponde correttamente prima di
          collegarlo al cron in PR2. Temporanea: in PR4 sara&apos;
          sostituita dalla UI completa <code>/admin/services/exchanges</code>.
        </p>
      </header>
      <BinanceTestClient />
    </div>
  );
}
