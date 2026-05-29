import { requireAdminSectionPage } from "@/lib/rbac/guards";
import type { Metadata } from "next";
import { WatchlistHeader } from "./_components/watchlist-header";

export const metadata: Metadata = { title: "Watchlist" };

export default async function WatchlistAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminSectionPage("modules:watchlist");
  return (
    <div className="space-y-5">
      <WatchlistHeader />
      {children}
    </div>
  );
}
