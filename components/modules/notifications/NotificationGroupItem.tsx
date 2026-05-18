"use client";
// components/modules/notifications/NotificationGroupItem.tsx
//
// Render di un gruppo aggregato (>= 2 notifiche dello stesso type+post
// nello stesso giorno). Pattern Twitter/Threads:
//   - Avatar dei primi 2 attori in overlap
//   - Summary: "{first}, {second} e N altre persone hanno reagito al
//     tuo post" — niente preview (sono N notifiche diverse, ognuna con
//     il proprio preview che però è uguale dato che è dello stesso
//     post; renderizziamo il preview del representative).
//   - Icona reaction inline (presa dal representative; in gruppi tutti
//     gli items sono dello stesso type, ma reaction puntuale può
//     differire — mostriamo quella del representative come "esempio").
//   - Click → target del representative.
//   - Unread: il gruppo è "unread" se ALMENO uno degli items è unread.
//     Mark-as-read on click marca SOLO il representative (gli altri
//     vengono coperti dal bulk mark-all-read al mount).
import { useTransition } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Bell } from "lucide-react";
import { REACTION_ICON } from "@/components/modules/posts/icons";
import {
  resolveNotificationTarget,
  type NotificationTarget,
} from "@/lib/modules/notifications/notification-targets";
import { markNotificationAsRead } from "@/lib/modules/notifications/actions";
import type {
  NotificationActor,
  NotificationListItem,
} from "@/lib/modules/notifications/queries";

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
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
  }).format(new Date(date));
}

function AvatarStack({
  actors,
  fallbackBell,
}: {
  actors: Array<NotificationActor | null>;
  fallbackBell: boolean;
}) {
  // Mostra max 2 avatars in overlap (-ml-3 per il secondo).
  const visible = actors.slice(0, 2);
  return (
    <div className="flex items-center shrink-0">
      {visible.map((a, i) => (
        <div
          key={a?.id ?? `slot-${i}`}
          className={i === 0 ? "" : "-ml-3"}
          style={{ zIndex: visible.length - i }}
        >
          {a?.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={a.avatarUrl}
              alt=""
              className="w-10 h-10 rounded-full object-cover ring-2 ring-gc-bg-2"
              loading="lazy"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-gc-line flex items-center justify-center text-gc-fg-muted ring-2 ring-gc-bg-2">
              {fallbackBell ? (
                <Bell size={16} strokeWidth={1.75} aria-hidden />
              ) : (
                <span className="text-xs">?</span>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function NotificationGroupItem({
  items,
  representative,
  onMarkedRead,
}: {
  items: NotificationListItem[];
  representative: NotificationListItem;
  onMarkedRead?: () => void;
}) {
  const tTypes = useTranslations("notifications.types");
  const tUi = useTranslations("notifications.ui");
  const locale = useLocale();
  const [, startTransition] = useTransition();

  const target: NotificationTarget | null = resolveNotificationTarget(
    representative.type,
    representative.postId,
    representative.commentId,
    representative.payload as Record<string, unknown>,
  );

  // Compose "Alice, Bob e N altri" — dedupli per actor.id per evitare
  // di contare lo stesso attore più volte (caso raro ma possibile dopo
  // dedup_window scaduto).
  const seenActorIds = new Set<string>();
  const distinctActors: NotificationListItem[] = [];
  for (const it of items) {
    const id = it.actor?.id ?? "unknown";
    if (seenActorIds.has(id)) continue;
    seenActorIds.add(id);
    distinctActors.push(it);
  }
  const totalDistinct = distinctActors.length;
  const fallback = tUi("unknown_actor");
  const firstName = actorLabel(distinctActors[0]?.actor ?? null, fallback);
  const secondName = actorLabel(distinctActors[1]?.actor ?? null, fallback);

  let actorsText: string;
  if (totalDistinct <= 1) {
    actorsText = firstName;
  } else if (totalDistinct === 2) {
    actorsText = tUi("actors_two", { first: firstName, second: secondName });
  } else {
    actorsText = tUi("actors_many", {
      first: firstName,
      second: secondName,
      others: tUi("and_others", { count: totalDistinct - 2 }),
    });
  }

  const summary = target
    ? tTypes(target.summaryKey, { actor: actorsText })
    : `${actorsText} → ${representative.type}`;

  const preview = target?.commentPreview ?? target?.postPreview ?? null;

  const ReactionIcon = target?.reactionKind
    ? REACTION_ICON[target.reactionKind]
    : null;

  const hasUnread = items.some((i) => i.readAt === null);

  const handleClick = () => {
    if (!hasUnread) return;
    startTransition(async () => {
      // Marca il representative come letto. Il bulk-all on-mount della
      // page si occupa degli altri (debounced 1.5s). Sufficiente per
      // l'UX immediato del click.
      const res = await markNotificationAsRead(representative.id);
      if (res.ok) onMarkedRead?.();
    });
  };

  const Body = (
    <div className="flex items-start gap-3 px-4 py-3">
      <AvatarStack
        actors={distinctActors.slice(0, 2).map((i) => i.actor)}
        fallbackBell
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gc-fg leading-snug flex items-center gap-1.5 flex-wrap">
          {ReactionIcon ? (
            <span className="inline-flex items-center" aria-hidden>
              <ReactionIcon size={16} />
            </span>
          ) : null}
          <span>{summary}</span>
        </p>
        {preview ? (
          <p className="text-xs text-gc-fg-muted italic mt-1 line-clamp-2">
            &ldquo;{preview}&rdquo;
          </p>
        ) : null}
        <p className="text-[11px] text-gc-fg-muted mt-1">
          {formatRelative(representative.createdAt, locale)}
        </p>
      </div>
      {hasUnread ? (
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
          hasUnread ? "bg-gc-accent/5 hover:bg-gc-accent/10" : "hover:bg-gc-bg-3/40"
        }`}
      >
        {Body}
      </Link>
    );
  }

  return (
    <div
      className={`block border-b border-gc-line/40 ${
        hasUnread ? "bg-gc-accent/5" : ""
      }`}
    >
      {Body}
    </div>
  );
}
