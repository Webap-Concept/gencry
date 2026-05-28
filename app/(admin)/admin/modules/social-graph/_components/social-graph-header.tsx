// Server wrapper: legge le tabs dal manifest del modulo (single source of
// truth con la sidebar) e le passa al client component che gestisce
// active state. Pattern allineato a prices-header.tsx.
import { getModuleTabs } from "@/lib/admin-module-tabs";
import { SOCIAL_GRAPH_MODULE } from "@/lib/modules/social-graph/manifest";
import { SocialGraphHeaderClient } from "./social-graph-header-client";

export async function SocialGraphHeader() {
  const tabs = await getModuleTabs(SOCIAL_GRAPH_MODULE);
  return <SocialGraphHeaderClient tabs={tabs} />;
}
