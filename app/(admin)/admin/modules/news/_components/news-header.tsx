// app/(admin)/admin/modules/news/_components/news-header.tsx
// Header del modulo News: legge le tabs dal manifest (single source of
// truth con la sidebar) e le passa al client component.
import { getModuleTabs } from "@/lib/admin-module-tabs";
import { NEWS_MODULE } from "@/lib/modules/news/manifest";
import { AdminStickyHeader } from "@/app/(admin)/admin/_components/admin-sticky-header";

export async function NewsHeader() {
  const tabs = await getModuleTabs(NEWS_MODULE);
  return <AdminStickyHeader tabs={tabs} />;
}
