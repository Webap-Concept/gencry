// Server wrapper: legge le tabs dal manifest del modulo (single source
// of truth con la sidebar) e le passa al client component che gestisce
// l'active state. Pattern allineato a social-graph-header.tsx.
import { getModuleTabs } from "@/lib/admin-module-tabs";
import { WATCHLIST_MODULE } from "@/lib/modules/watchlist/manifest";
import { WatchlistHeaderClient } from "./watchlist-header-client";

export async function WatchlistHeader() {
  const tabs = await getModuleTabs(WATCHLIST_MODULE);
  return <WatchlistHeaderClient tabs={tabs} />;
}
