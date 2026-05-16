// Server wrapper: legge le tabs dal manifest del modulo (single
// source of truth con la sidebar) e le passa al client component
// che gestisce active state + info-button guide per segment.
import { getModuleTabs } from "@/lib/admin-module-tabs";
import { PRICES_MODULE } from "@/lib/modules/prices/manifest";
import { PricesHeaderClient } from "./prices-header-client";

export async function PricesHeader() {
  const tabs = await getModuleTabs(PRICES_MODULE);
  return <PricesHeaderClient tabs={tabs} />;
}
