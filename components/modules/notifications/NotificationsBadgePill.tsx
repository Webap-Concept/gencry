"use client";
// components/modules/notifications/NotificationsBadgePill.tsx
//
// Pill del badge unread — consumer PURO del NotificationsUnreadProvider.
// Zero subscription propria: legge il count dal context condiviso. Puo'
// essere montato N volte (sidebar + bottom-nav) senza moltiplicare le
// connessioni realtime.
//
// Render: null se count <= 0 (niente pallino quando non ci sono unread).
import { useNotificationsUnread } from "./NotificationsUnreadProvider";

export function NotificationsBadgePill() {
  const count = useNotificationsUnread();
  if (count <= 0) return null;
  const display = count > 99 ? "99+" : String(count);
  return (
    <span
      aria-label={`${count} non lette`}
      className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-gc-accent text-white text-[10px] font-semibold leading-none"
    >
      {display}
    </span>
  );
}
