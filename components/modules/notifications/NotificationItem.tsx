"use client";
// components/modules/notifications/NotificationItem.tsx
//
// Riga lista per una singola notifica. Render:
//   1. Avatar attore (fallback Bell se actor==null)
//   2. Summary i18n type-specific con interpolazione `{actor}`
//      + icona SVG canonica della reaction inline (se applicabile),
//      da `components/modules/posts/icons/REACTION_ICON`. NON emoji
//      generici — coerenza con il rest del modulo posts.
//   3. Preview body (post o commento) line-clamped 2 righe, italic.
//      Disponibile dal trigger M_notifications_002 in poi; per
//      notifiche più vecchie cade su null senza rompere.
//   4. Time relativo + dot unread.
//   5. Click → naviga al target risolto da notification-targets.ts +
//      mark-as-read per-row (in aggiunta al bulk on-mount della lista).
import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { REACTION_ICON } from "@/components/modules/posts/icons";
import { UserAvatar } from "@/components/ui/user-avatar";
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

/** Path al profilo: preferisce username (URL stabile), fallback id.
 *  null se actor null. */
function actorProfileHref(actor: NotificationActor | null): string | null {
  if (!actor) return null;
  return `/u/${actor.username ?? actor.id}`;
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

export function NotificationItem({
  item,
  onMarkedRead,
}: {
  item: NotificationListItem;
  /** Callback opzionale: la lista parent decrementa lo unread count optimistic. */
  onMarkedRead?: () => void;
}) {
  const tTypes = useTranslations("notifications.types");
  const tUi = useTranslations("notifications.ui");
  const locale = useLocale();
  const router = useRouter();
  const [, startTransition] = useTransition();

  const target: NotificationTarget | null = resolveNotificationTarget(
    item.type,
    item.postId,
    item.commentId,
    item.payload as Record<string, unknown>,
  );

  const actorName = actorLabel(item.actor, tUi("unknown_actor"));
  const profileHref = actorProfileHref(item.actor);
  const isUnread = item.readAt === null;

  // Summary i18n con tag rich <actor>: il nome diventa <Link> al profilo.
  // Click sull'<a> interno NON deve scatenare la mark-as-read del link
  // wrapper (anchor nested non valido HTML), quindi gestiamo entrambi
  // come componenti separati: il summary è renderizzato qui sotto in
  // un <p>, e il wrapper esterno è un <button> (no <a>) che fa
  // router.push manualmente — vedi <Body> sotto.
  const summary = target ? (
    tTypes.rich(target.summaryKey, {
      name: actorName,
      // Valori extra dal payload (es. strike_number per moderation.*).
      ...target.templateValues,
      actor: (chunks) =>
        profileHref ? (
          <Link
            href={profileHref}
            prefetch={false}
            onClick={(e) => e.stopPropagation()}
            className="font-medium text-gc-fg hover:underline"
          >
            {chunks}
          </Link>
        ) : (
          <span className="font-medium text-gc-fg">{chunks}</span>
        ),
    })
  ) : (
    <>
      {actorName} → {item.type}
    </>
  );

  // Per commenti il preview rilevante è quello del commento; per gli altri
  // è il post. Per i quote repost, post_preview = corpo del quote.
  const preview = target?.commentPreview ?? target?.postPreview ?? null;

  // Icona reaction inline: solo per tipi reaction-based. Renderizzata DOPO
  // l'avatar e PRIMA del summary, posizionata come "badge" inline.
  const ReactionIcon = target?.reactionKind
    ? REACTION_ICON[target.reactionKind]
    : null;

  const handleClick = () => {
    if (!isUnread) return;
    startTransition(async () => {
      const res = await markNotificationAsRead(item.id);
      if (res.ok) onMarkedRead?.();
    });
  };

  const Body = (
    <div className="flex items-start gap-3 px-4 py-3">
      <UserAvatar user={item.actor ?? { id: item.actorId ?? null }} size={40} />
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
    // Wrapper è un div role=link (NON un <a>) perché il summary contiene
    // un <Link> al profilo del actor: nested <a> sarebbe HTML invalido.
    // Pattern già usato in PostCard per il quote embed.
    const handleWrapperClick = (e: React.MouseEvent<HTMLElement>) => {
      // Skip se il click viene da un anchor/button interno (es. Link al
      // profilo dell'actor): lascia che cattura il suo navigation senza
      // double-fire.
      const t = e.target as HTMLElement;
      if (
        t.closest('a, button, [role="menuitem"], [role="menu"], [role="button"]')
      ) {
        return;
      }
      const sel =
        typeof window !== "undefined" ? window.getSelection?.() : null;
      if (sel && sel.toString().trim().length > 0) return;
      handleClick();
      router.push(target.href);
    };
    return (
      <div
        role="link"
        tabIndex={0}
        onClick={handleWrapperClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" && e.target === e.currentTarget) {
            handleClick();
            router.push(target.href);
          }
        }}
        className={`block border-b border-gc-line/40 cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gc-accent ${
          isUnread ? "bg-gc-accent/5 hover:bg-gc-accent/10" : "hover:bg-gc-bg-3/40"
        }`}
      >
        {Body}
      </div>
    );
  }

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
