// components/modules/notifications/NotificationsBadge.tsx
//
// Server wrapper: fetcha il count unread iniziale dal DB e lo passa al
// client che gestisce il realtime push. Mountato dalla sidebar accanto
// alla voce "Notifiche". React `cache()` di `getUnreadNotificationsCount`
// è gestito a livello query, quindi se il layout chiamasse anche altri
// fan-out la query è dedupped per request.
//
// Render: null se viewer anonimo (la sidebar accade già di non mostrare
// la voce in quel caso, ma doppia difesa).
import { getUser } from "@/lib/db/queries";
import { getUnreadNotificationsCount } from "@/lib/modules/notifications/queries";
import { NotificationsBadgeClient } from "./NotificationsBadgeClient";

export async function NotificationsBadge() {
  const user = await getUser();
  if (!user) return null;
  const count = await getUnreadNotificationsCount(user.id);
  return <NotificationsBadgeClient viewerUserId={user.id} initialCount={count} />;
}
