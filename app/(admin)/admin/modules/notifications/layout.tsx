import { requireAdminSectionPage } from "@/lib/rbac/guards";
import type { Metadata } from "next";
import { NotificationsHeader } from "./_components/notifications-header";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminSectionPage("modules:notifications");
  return (
    <div className="space-y-5">
      <NotificationsHeader />
      {children}
    </div>
  );
}
