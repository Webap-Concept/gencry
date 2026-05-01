import { getAllBreakerStates } from "@/lib/prices/circuit-breaker";
import { getPricesConfig } from "@/lib/prices/config";
import { getRecentRuns, getRecentSyncStats } from "@/lib/prices/queries";
import type { Metadata } from "next";
import { HealthDashboard } from "./_components/health-dashboard";

export const metadata: Metadata = { title: "Prices / Health" };

export const dynamic = "force-dynamic";

export default async function PricesHealthPage() {
  const [config, breakers, syncStats, snapshotStats, cleanupStats, recentRuns] =
    await Promise.all([
      getPricesConfig(),
      getAllBreakerStates(),
      getRecentSyncStats("sync", 24),
      getRecentSyncStats("snapshot", 24),
      getRecentSyncStats("cleanup", 168),
      getRecentRuns(20),
    ]);

  return (
    <HealthDashboard
      config={config}
      breakers={breakers}
      syncStats={syncStats}
      snapshotStats={snapshotStats}
      cleanupStats={cleanupStats}
      recentRuns={recentRuns}
    />
  );
}
