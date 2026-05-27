// app/(admin)/admin/modules/prices/exchanges/page.tsx
//
// UI admin per la gestione degli exchange del modulo prices.
// Lista tutti gli adapter del registry implementati in codice +
// le row corrispondenti su `price_exchanges`. Permette:
//   - enable/disable di ogni exchange (toggle persistente)
//   - impostazione API key/secret (per exchange che la richiedono)
//   - health check live (chiama adapter.healthCheck(), persiste il
//     risultato in last_health_*)
//   - vedere quanti coin sono routati su ciascun exchange
//
// Sostituisce le pagine temporanee /diagnostics-binance e
// /diagnostics-hot-prices (verranno rimosse in PR4b).
import { requireAdminSectionPage } from "@/lib/rbac/guards";
import { listAdminExchanges } from "@/lib/modules/prices/exchanges/queries";
import type { Metadata } from "next";
import { ExchangesClient } from "./_components/exchanges-client";

export const metadata: Metadata = { title: "Prices / Exchanges" };
export const dynamic = "force-dynamic";

export default async function PricesExchangesPage() {
  await requireAdminSectionPage("admin:users");
  const rows = await listAdminExchanges();
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-lg font-semibold" style={{ color: "var(--admin-text)" }}>
          Exchanges
        </h1>
        <p className="text-[12.5px] mt-0.5" style={{ color: "var(--admin-text-faint)" }}>
          Configurazione delle fonti exchange usate dal cron prezzi. Per
          ogni coin (vedi <code>Coins</code>) puoi impostare il
          <code className="ml-1">preferred_exchange</code> + il
          <code className="ml-1">exchange_symbol</code>; i coin senza
          mapping ricadono sul fallback CoinGecko.
        </p>
      </header>
      <ExchangesClient initialRows={rows} />
    </div>
  );
}
