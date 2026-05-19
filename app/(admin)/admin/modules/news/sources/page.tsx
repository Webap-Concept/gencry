import type { Metadata } from "next";
import { getAllSources } from "@/lib/modules/news/queries";
import { SourcesPanel } from "./_components/sources-panel";

export const metadata: Metadata = { title: "News / Sources" };
export const dynamic = "force-dynamic";

export default async function NewsSourcesPage() {
  const sources = await getAllSources();
  return <SourcesPanel initialSources={sources} />;
}
