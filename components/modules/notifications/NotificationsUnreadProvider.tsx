"use client";
// components/modules/notifications/NotificationsUnreadProvider.tsx
//
// Provider UNICO del contatore unread notifiche. Apre UNA sola
// subscription Supabase Realtime e condivide il count via context a
// tutti i badge (sidebar + bottom-nav), che diventano consumer puri.
//
// Why: prima ogni <NotificationsBadgeClient> apriva il proprio channel
// `notifications-badge:<uid>`. Essendo montato 2-3 volte insieme
// (sidebar desktop + bottom-nav mobile, entrambi sempre nel DOM; +
// PublicAdaptiveShell), si aprivano 2-3 WebSocket subscription per lo
// stesso dato. Consolidando in un provider unico → 1 subscription.
//
// Montaggio: avvolge lo shell (1 istanza per layout/shell). I pill
// leggono il context. initialCount e' server-fetched e passato come
// prop → SSR coerente, niente flash.
//
// Degraded-safe: se Supabase non e' configurato, il count resta
// `initialCount` e si aggiorna solo al prossimo navigation (server
// re-render).
import {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";
import { getBrowserSupabase } from "@/lib/supabase/browser-client";
import { generateSupabaseRealtimeToken } from "@/lib/auth/supabase-realtime-token";

const ALL_READ_EVENT = "notifications:all-read";

/** Dispatch del reset globale: NotificationsList lo chiama dopo la bulk
 *  mark-all-read → il provider azzera il count. */
export const dispatchAllRead = () => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(ALL_READ_EVENT));
  }
};

const UnreadContext = createContext<number>(0);

/** Count unread corrente. 0 fuori dal provider (no-op safe). */
export function useNotificationsUnread(): number {
  return useContext(UnreadContext);
}

export function NotificationsUnreadProvider({
  viewerUserId,
  initialCount,
  children,
}: {
  viewerUserId: string;
  initialCount: number;
  children: React.ReactNode;
}) {
  const [count, setCount] = useState(initialCount);

  // 1 subscription INSERT su notifications:user_id=me → +1.
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

  // Reset a 0 quando NotificationsList completa la bulk mark-all-read.
  useEffect(() => {
    const handler = () => setCount(0);
    window.addEventListener(ALL_READ_EVENT, handler);
    return () => window.removeEventListener(ALL_READ_EVENT, handler);
  }, []);

  // Se l'initialCount server cambia tra navigazioni (es. nuovo SSR),
  // riallinea — ma solo verso l'alto al mount iniziale; gli update live
  // li gestisce la subscription. Manteniamo semplice: ignoriamo i
  // cambi successivi di initialCount per non sovrascrivere lo stato live.

  return (
    <UnreadContext.Provider value={count}>{children}</UnreadContext.Provider>
  );
}
