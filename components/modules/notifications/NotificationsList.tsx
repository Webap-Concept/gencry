"use client";
// components/modules/notifications/NotificationsList.tsx
//
// Lista notifiche con:
//   - first batch SSR via props (initial)
//   - infinite scroll via IntersectionObserver + loadMoreNotificationsAction
//   - realtime prepend via Supabase Postgres Changes (filter user_id)
//   - bulk mark-all-read on mount (debounced 1.5s) per azzerare il badge
//     sidebar in 1 UPDATE invece di N
//
// Pattern coerente con FeedList del modulo posts (cursor opaco, dedup
// via Set di id, scroll-parent root). Realtime è degraded-safe: se
// Supabase env non disponibili → solo SSR + scroll, niente crash.
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Bell } from "lucide-react";
import { getBrowserSupabase } from "@/lib/supabase/browser-client";
import { generateSupabaseRealtimeToken } from "@/lib/auth/supabase-realtime-token";
import {
  getNotificationByIdAction,
  loadMoreNotificationsAction,
  markAllNotificationsAsRead,
} from "@/lib/modules/notifications/actions";
import type { NotificationListItem } from "@/lib/modules/notifications/queries";
import { NotificationItem } from "./NotificationItem";
import { NotificationGroupItem } from "./NotificationGroupItem";
import { aggregateNotifications } from "./aggregate";
import { dispatchAllRead } from "./NotificationsBadgeClient";

const MARK_ALL_DELAY_MS = 1500;

type Props = {
  viewerUserId: string;
  initial: {
    items: NotificationListItem[];
    nextCursor: string | null;
  };
  /** Avatar fallback per le notifiche di sistema (actor === null).
   *  Tipicamente la favicon del sito, letta da app_settings.app_favicon_url
   *  dal page handler. Null → vecchio fallback "?" di UserAvatar. */
  systemAvatarUrl?: string | null;
};

export function NotificationsList({ viewerUserId, initial, systemAvatarUrl = null }: Props) {
  const tUi = useTranslations("notifications.ui");
  const [items, setItems] = useState<NotificationListItem[]>(initial.items);
  const [nextCursor, setNextCursor] = useState<string | null>(initial.nextCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // ── Bulk mark-all-read on mount (debounced) ───────────────────────────
  useEffect(() => {
    const hasUnread = items.some((i) => i.readAt === null);
    if (!hasUnread) return;
    const t = setTimeout(async () => {
      const res = await markAllNotificationsAsRead();
      if (res.ok) {
        const now = new Date();
        setItems((prev) =>
          prev.map((i) => (i.readAt === null ? { ...i, readAt: now } : i)),
        );
        // Notifica il badge sidebar (componente sibling client-side) che
        // l'unread count è azzerato senza aspettare il re-render server.
        dispatchAllRead();
      }
    }, MARK_ALL_DELAY_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Realtime: prepend new INSERT su notifications:user_id=me ──────────
  useEffect(() => {
    const supabase = getBrowserSupabase();
    if (!supabase) return; // env mancanti → niente realtime, OK
    let cancelled = false;
    let channelRef: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      // RLS gated → serve JWT che impersona il viewer per ricevere righe.
      const tokenRes = await generateSupabaseRealtimeToken();
      if (cancelled) return;
      if (tokenRes.ok) {
        await supabase.realtime.setAuth(tokenRes.data.token);
      }

      const channel = supabase
        .channel(`notifications:${viewerUserId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${viewerUserId}`,
          },
          (payload) => {
            // payload.new è la row come oggetto DB (snake_case). NON
            // contiene actor né post/comment preview hydratati (RLS+JOIN
            // non passano via Postgres Changes). Chiamiamo una Server
            // Action per fetchare l'item completo e poi merge.
            const row = payload.new as Record<string, unknown>;
            const incomingId = String(row.id);
            // Optimistic placeholder con actor null così l'utente vede
            // SUBITO la riga apparire (badge +1 immediato); l'hydration
            // arriva entro <100ms e sostituisce.
            const placeholder: NotificationListItem = {
              id: incomingId,
              userId: String(row.user_id),
              type: String(row.type),
              actorId: (row.actor_id as string | null) ?? null,
              postId: (row.post_id as string | null) ?? null,
              commentId: (row.comment_id as string | null) ?? null,
              payload:
                (row.payload as Record<string, unknown> | null) ?? {},
              readAt: row.read_at ? new Date(String(row.read_at)) : null,
              emailSentAt: row.email_sent_at
                ? new Date(String(row.email_sent_at))
                : null,
              createdAt: new Date(String(row.created_at)),
              actor: null,
            };
            setItems((prev) => {
              if (prev.some((i) => i.id === incomingId)) return prev;
              return [placeholder, ...prev];
            });
            // Fetch hydratato fire-and-forget; sostituisce il placeholder
            // appena disponibile. Niente await sul handler Realtime.
            void (async () => {
              const res = await getNotificationByIdAction(incomingId);
              if (!res.ok || !res.data?.item) return;
              const full = res.data.item;
              setItems((prev) =>
                prev.map((i) => (i.id === incomingId ? full : i)),
              );
            })();
          },
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

  // ── Infinite scroll ───────────────────────────────────────────────────
  const loadMore = useCallback(async () => {
    if (loadingMore || nextCursor === null) return;
    setLoadingMore(true);
    try {
      const res = await loadMoreNotificationsAction({ cursor: nextCursor });
      if (res.ok) {
        setItems((prev) => {
          const seen = new Set(prev.map((i) => i.id));
          const fresh = res.data!.items.filter((i) => !seen.has(i.id));
          return [...prev, ...fresh];
        });
        setNextCursor(res.data!.nextCursor);
      }
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, nextCursor]);

  useEffect(() => {
    if (!sentinelRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: "400px" },
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [loadMore]);

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-12 h-12 rounded-full bg-gc-bg-3 flex items-center justify-center text-gc-fg-muted mb-3">
          <Bell size={22} strokeWidth={1.75} aria-hidden />
        </div>
        <p className="text-gc-fg font-medium">{tUi("empty_title")}</p>
        <p className="text-sm text-gc-fg-muted mt-1 max-w-sm">
          {tUi("empty_description")}
        </p>
      </div>
    );
  }

  // Aggregazione client-side: stesso type+post+giorno = 1 gruppo.
  // I tipi non-aggregabili (mention, repost) restano singoli per design.
  const groups = aggregateNotifications(items);

  const markRead = (id: string) => {
    const now = new Date();
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, readAt: now } : i)),
    );
  };

  return (
    <div className="bg-gc-bg-2 border border-gc-line rounded-xl overflow-hidden">
      {groups.map((g) =>
        g.kind === "single" ? (
          <NotificationItem
            key={g.item.id}
            item={g.item}
            onMarkedRead={() => markRead(g.item.id)}
            systemAvatarUrl={systemAvatarUrl}
          />
        ) : (
          <NotificationGroupItem
            key={`group-${g.representative.id}`}
            items={g.items}
            representative={g.representative}
            onMarkedRead={() => markRead(g.representative.id)}
            systemAvatarUrl={systemAvatarUrl}
          />
        ),
      )}
      {nextCursor !== null ? (
        <div
          ref={sentinelRef}
          className="py-6 text-center text-xs text-gc-fg-muted"
        >
          {loadingMore ? tUi("loading_more") : ""}
        </div>
      ) : null}
    </div>
  );
}
