// Server wrapper: legge le tabs dal manifest del modulo (single
// source of truth con la sidebar) e le passa al client component
// che gestisce solo l'active state.
import { getModuleTabs } from "@/lib/admin-module-tabs";
import { NOTIFICATIONS_MODULE } from "@/lib/modules/notifications/manifest";
import { NotificationsHeaderClient } from "./notifications-header-client";

export async function NotificationsHeader() {
  const tabs = await getModuleTabs(NOTIFICATIONS_MODULE);
  return <NotificationsHeaderClient tabs={tabs} />;
}
