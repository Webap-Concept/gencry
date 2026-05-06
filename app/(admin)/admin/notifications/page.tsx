// app/(admin)/admin/notifications/page.tsx
import { getUserPermissions } from "@/lib/rbac/can";
import { requireAdminPage } from "@/lib/rbac/guards";
import {
  listAllNotifications,
  type NotificationStatus,
} from "@/lib/notifications/queries";
import { serializeNotification } from "@/lib/notifications/serializers";
import { Bell } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotificationsList } from "./_components/notifications-list";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.notifications");
  return { title: t("metaTitle") };
}

const VALID_STATUSES: NotificationStatus[] = [
  "active",
  "snoozed",
  "dismissed",
  "resolved",
  "all",
];

async function NotificationsContent({ status }: { status: NotificationStatus }) {
  const user = await requireAdminPage();
  const permissions = user.isAdmin
    ? new Set<string>(["__superadmin__"])
    : await getUserPermissions(user);
  const rows = await listAllNotifications(permissions, { status });
  return (
    <NotificationsList
      notifications={rows.map(serializeNotification)}
      currentStatus={status}
    />
  );
}

export default async function AdminNotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireAdminPage();
  const t = await getTranslations("admin.notifications");
  const params = await searchParams;
  const requested = params.status as NotificationStatus | undefined;
  const status: NotificationStatus = VALID_STATUSES.includes(
    requested as NotificationStatus,
  )
    ? (requested as NotificationStatus)
    : "active";

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{
            background:
              "color-mix(in srgb, var(--admin-accent) 12%, var(--admin-card-bg))",
            border:
              "1px solid color-mix(in srgb, var(--admin-accent) 25%, transparent)",
          }}>
          <Bell size={18} style={{ color: "var(--admin-accent)" }} />
        </div>
        <div>
          <h2
            className="text-lg font-bold"
            style={{ color: "var(--admin-text)" }}>
            {t("pageTitle")}
          </h2>
          <p
            className="text-sm mt-0.5"
            style={{ color: "var(--admin-text-faint)" }}>
            {t("pageSubtitle")}
          </p>
        </div>
      </div>

      <Suspense
        key={status}
        fallback={
          <div className="flex items-center justify-center h-40">
            <div
              className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
              style={{
                borderColor: "var(--admin-accent)",
                borderTopColor: "transparent",
              }}
            />
          </div>
        }>
        <NotificationsContent status={status} />
      </Suspense>
    </div>
  );
}
