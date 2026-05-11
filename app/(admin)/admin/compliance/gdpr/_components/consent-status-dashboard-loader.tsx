import {
  getGdprDashboardStats,
  getGdprHealthChecks,
} from "@/lib/account/gdpr-stats";
import { ConsentStatusDashboard } from "./consent-status-dashboard";

/**
 * Async wrapper around <ConsentStatusDashboard> so the page can stream
 * the rest of the GDPR view (header, settings form, tools) without
 * waiting for the consolidated `users` aggregate to land. With the
 * fan-out cap from the dev DB pool (drizzle.ts max:1) and the long
 * tail of Supabase EU roundtrips, the metrics section is by far the
 * slowest leaf on this page — putting it behind its own <Suspense>
 * boundary keeps TTFB tight even when the cache is cold.
 */
export default async function ConsentStatusDashboardLoader({
  consentLogEnabled,
  backupTier,
  pagesAdminPath,
}: {
  consentLogEnabled: boolean;
  backupTier: string;
  pagesAdminPath: string;
}) {
  const [stats, health] = await Promise.all([
    getGdprDashboardStats(),
    getGdprHealthChecks(),
  ]);

  return (
    <ConsentStatusDashboard
      stats={stats}
      health={health}
      consentLogEnabled={consentLogEnabled}
      backupTier={backupTier}
      pagesAdminPath={pagesAdminPath}
    />
  );
}
