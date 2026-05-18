"use client";
// components/modules/notifications/NotificationsBadgeClient.tsx
//
// Pill del badge unread accanto a "Notifiche" nella sidebar. Realtime
// push via Supabase Postgres Changes su INSERT (incremento +1). Reset
// a 0 quando il bulk mark-all-read ha successo: NotificationsList
// dispatch un custom event window 'notifications:all-read' che noi
// ascoltiamo.
//
// Pattern degraded-safe: se Supabase env non configurate, il badge
// resta col valore iniziale e si aggiorna solo al prossimo navigation
// (server re-render del layout).
import { useEffect, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/browser-client";
import { generateSupabaseRealtimeToken } from "@/lib/auth/supabase-realtime-token";

const ALL_READ_EVENT = "notifications:all-read";

export const dispatchAllRead = () => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(ALL_READ_EVENT));
  }
};

export function NotificationsBadgeClient({
  viewerUserId,
  initialCount,
}: {
  viewerUserId: string;
  initialCount: number;
}) {
  const [count, setCount] = useState(initialCount);

  // Realtime: subscribe INSERT su notifications:user_id=me → +1.
  useEffect(() => {
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    let cancelled = false;
    let channelRef: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const tokenRes = await generateSupabaseRealtimeToken();
      if (cancelled) return;
      if (tokenRes.ok) {
        await supabase.realtime.setAuth(tokenRes.data.token);
      }
      const channel = supabase
        .channel(`notifications-badge:${viewerUserId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${viewerUserId}`,
          },
          () => setCount((c) => c + 1),
        )
        .subscribe();
      channelRef = channel;
    })();

    return () => {
      cancelled = true;
      if (channelRef) {
        const supabase = getBrowserSupabase();
        if (supabase) supabase.removeChannel(channelRef);
      }
    };
  }, [viewerUserId]);

  // Cross-component sync: quando NotificationsList completa la bulk
  // mark-all-read, dispatch event → noi resettiamo.
  useEffect(() => {
    const handler = () => setCount(0);
    window.addEventListener(ALL_READ_EVENT, handler);
    return () => window.removeEventListener(ALL_READ_EVENT, handler);
  }, []);

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
