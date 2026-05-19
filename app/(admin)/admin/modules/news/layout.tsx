import { requireAdminSectionPage } from "@/lib/rbac/guards";
import type { Metadata } from "next";
import { NewsHeader } from "./_components/news-header";

export const metadata: Metadata = { title: "News" };

export default async function NewsAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminSectionPage("modules:news");
  return (
    <div className="space-y-5">
      <NewsHeader />
      {children}
    </div>
  );
}
