"use client";
// components/modules/notifications/NotificationItem.tsx
//
// Riga lista per una singola notifica. Render: avatar attore (fallback
// Bell se actor==null), summary i18n type-specific (con interpolazione
// di actor + reaction emoji se applicabile), tempo relativo, dot unread.
// Click → naviga al target risolto da notification-targets.ts.
//
// Mark-as-read per-row al click (in aggiunta al bulk on-mount): copre
// il caso "l'utente apre una notifica vecchia da deep-link" e il caso
// "nuova notifica arrivata in realtime dopo il bulk mark".
import { useTransition } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Bell } from "lucide-react";
import {
  resolveNotificationTarget,
  type NotificationTarget,
} from "@/lib/modules/notifications/notification-targets";
import { markNotificationAsRead } from "@/lib/modules/notifications/actions";
import type {
  NotificationActor,
  NotificationListItem,
} from "@/lib/modules/notifications/queries";

const REACTION_EMOJI: Record<string, string> = {
  like: "❤️",
  bullish: "🐂",
  bearish: "🐻",
  to_the_moon: "🚀",
  dump: "📉",
};

function actorLabel(actor: NotificationActor | null, fallback: string): string {
  if (!actor) return fallback;
  if (actor.username) return `@${actor.username}`;
  const full = [actor.firstName, actor.lastName].filter(Boolean).join(" ");
  return full || fallback;
}

function formatRelative(date: Date, locale: string): string {
  const diffMs = Date.now() - new Date(date).getTime();
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}g`;
  // Oltre 7 giorni: formato corto data locale
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
  }).format(new Date(date));
}

export function NotificationItem({
  item,
  onMarkedRead,
}: {
  item: NotificationListItem;
  /** Callback opzionale: la lista parent decrementa lo unread count optimistic. */
  onMarkedRead?: () => void;
}) {
  const tTypes = useTranslations("modules.notifications.types");
  const tUi = useTranslations("modules.notifications.ui");
  const locale = useLocale();
  const [, startTransition] = useTransition();

  const target: NotificationTarget | null = resolveNotificationTarget(
    item.type,
    item.postId,
    item.commentId,
    item.payload as Record<string, unknown>,
  );

  const actor = actorLabel(item.actor, tUi("unknown_actor"));
  const reactionRaw = (item.payload as { reaction?: string })?.reaction;
  const reaction = reactionRaw ? REACTION_EMOJI[reactionRaw] ?? reactionRaw : "";
  const isUnread = item.readAt === null;

  // Summary i18n. Se target è null (tipo sconosciuto, forward-compat)
  // → fallback raw "{actor} → {type}" così l'utente vede comunque
  // qualcosa di leggibile invece di una key i18n mancante.
  const summary = target
    ? tTypes(target.summaryKey, { actor, reaction })
    : `${actor} → ${item.type}`;

  const handleClick = () => {
    if (!isUnread) return;
    startTransition(async () => {
      const res = await markNotificationAsRead(item.id);
      if (res.ok) onMarkedRead?.();
    });
  };

  const Body = (
    <div className="flex items-start gap-3 px-4 py-3">
      {item.actor?.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.actor.avatarUrl}
          alt=""
          className="w-10 h-10 rounded-full object-cover shrink-0"
          loading="lazy"
        />
      ) : (
        <div className="w-10 h-10 rounded-full bg-gc-line flex items-center justify-center text-gc-fg-muted shrink-0">
          <Bell size={18} strokeWidth={1.75} aria-hidden />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gc-fg leading-snug">{summary}</p>
        <p className="text-xs text-gc-fg-muted mt-0.5">
          {formatRelative(item.createdAt, locale)}
        </p>
      </div>
      {isUnread ? (
        <span
          aria-hidden
          className="mt-2 h-2 w-2 shrink-0 rounded-full bg-gc-accent"
          title={tUi("unread_dot_aria")}
        />
      ) : null}
    </div>
  );

  if (target) {
    return (
      <Link
        href={target.href}
        prefetch={false}
        onClick={handleClick}
        className={`block border-b border-gc-line/40 transition-colors ${
          isUnread ? "bg-gc-accent/5 hover:bg-gc-accent/10" : "hover:bg-gc-bg-3/40"
        }`}
      >
        {Body}
      </Link>
    );
  }

  // Tipo sconosciuto / target non risolvibile: riga statica non cliccabile.
  return (
    <div
      className={`block border-b border-gc-line/40 ${
        isUnread ? "bg-gc-accent/5" : ""
      }`}
    >
      {Body}
    </div>
  );
}
