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
  loadMoreNotificationsAction,
  markAllNotificationsAsRead,
} from "@/lib/modules/notifications/actions";
import type { NotificationListItem } from "@/lib/modules/notifications/queries";
import { NotificationItem } from "./NotificationItem";
import { dispatchAllRead } from "./NotificationsBadgeClient";

const MARK_ALL_DELAY_MS = 1500;

type Props = {
  viewerUserId: string;
  initial: {
    items: NotificationListItem[];
    nextCursor: string | null;
  };
};

export function NotificationsList({ viewerUserId, initial }: Props) {
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
            // payload.new è la row come oggetto DB (snake_case).
            const row = payload.new as Record<string, unknown>;
            const incoming: NotificationListItem = {
              id: String(row.id),
              userId: String(row.user_id),
              type: String(row.type),
              actorId: (row.actor_id as string | null) ?? null,
              postId: (row.post_id as string | null) ?? null,
              commentId: (row.comment_id as string | null) ?? null,
              payload:
                (row.payload as Record<string, unknown> | null) ?? {},
              readAt: row.read_at
                ? new Date(String(row.read_at))
                : null,
              createdAt: new Date(String(row.created_at)),
              // actor hydratato non disponibile via Realtime: lo lasciamo
              // null e la UI mostra fallback. Al prossimo refresh il SSR
              // lo idrata correttamente.
              actor: null,
            };
            setItems((prev) => {
              if (prev.some((i) => i.id === incoming.id)) return prev;
              return [incoming, ...prev];
            });
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

  return (
    <div className="bg-gc-bg-2 border border-gc-line rounded-xl overflow-hidden">
      {items.map((item) => (
        <NotificationItem
          key={item.id}
          item={item}
          onMarkedRead={() => {
            const now = new Date();
            setItems((prev) =>
              prev.map((i) =>
                i.id === item.id ? { ...i, readAt: now } : i,
              ),
            );
          }}
        />
      ))}
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
