// app/(admin)/admin/modules/news/_components/news-header.tsx
// Server wrapper: legge le tabs dal manifest del modulo (single source
// of truth con la sidebar) e le passa al client component che gestisce
// active state + info-button guide per segment.
import { getModuleTabs } from "@/lib/admin-module-tabs";
import { NEWS_MODULE } from "@/lib/modules/news/manifest";
import { NewsHeaderClient } from "./news-header-client";

export async function NewsHeader() {
  const tabs = await getModuleTabs(NEWS_MODULE);
  return <NewsHeaderClient tabs={tabs} />;
}
