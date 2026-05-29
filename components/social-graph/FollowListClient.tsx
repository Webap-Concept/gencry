"use client";
// components/social-graph/FollowListClient.tsx
//
// Client list + "Load more" infinite scroll. Server Action
// `loadMoreFollowList` paginazione keyset (cursor = createdAt ISO).
import { useCallback, useState, useTransition } from "react";
import Link from "next/link";
import { loadMoreFollowList } from "@/lib/modules/social-graph/list-actions";
import type { FollowListItem } from "@/lib/modules/social-graph/queries";
import { useTranslations } from "next-intl";
import type { FollowListDirection } from "./FollowListPage";

type Props = {
  direction: FollowListDirection;
  userId: string;
  initialItems: FollowListItem[];
  initialNextCursor: string | null;
  emptyTitle: string;
  emptyDescription: string;
};

function displayName(u: FollowListItem): string {
  const fn = u.firstName?.trim();
  const ln = u.lastName?.trim();
  if (fn && ln) return `${fn} ${ln}`;
  if (fn) return fn;
  if (ln) return ln;
  return u.username ?? "—";
}

export function FollowListClient({
  direction,
  userId,
  initialItems,
  initialNextCursor,
  emptyTitle,
  emptyDescription,
}: Props) {
  const [items, setItems] = useState<FollowListItem[]>(initialItems);
  const [cursor, setCursor] = useState<string | null>(initialNextCursor);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const tFeed = useTranslations("posts.feed");

  const onLoadMore = useCallback(() => {
    if (!cursor || isPending) return;
    setError(null);
    startTransition(async () => {
      const res = await loadMoreFollowList({
        direction,
        userId,
        cursor,
      });
      if (res.ok) {
        setItems((prev) => [...prev, ...res.data.items]);
        setCursor(res.data.nextCursor);
      } else {
        setError(res.error);
      }
    });
  }, [cursor, isPending, direction, userId]);

  if (items.length === 0) {
    return (
      <div className="bg-gc-bg-2 border border-dashed border-gc-line rounded-2xl p-8 text-center">
        <p className="font-medium text-gc-fg">{emptyTitle}</p>
        <p className="text-sm text-gc-fg-3 mt-1">{emptyDescription}</p>
      </div>
    );
  }

  return (
    <section aria-label={direction}>
      <ul className="space-y-2">
        {items.map((u) => (
          <li
            key={u.userId}
            className="bg-gc-bg-2 border border-gc-line rounded-xl p-4 flex items-center gap-3"
          >
            <Avatar item={u} />
            <div className="flex-1 min-w-0">
              <Link
                href={u.username ? `/u/${u.username.toLowerCase()}` : "#"}
                prefetch={false}
                className="text-sm font-medium text-gc-fg hover:underline truncate block"
              >
                {displayName(u)}
              </Link>
              {u.username ? (
                <p className="text-xs text-gc-fg-3 truncate">@{u.username}</p>
              ) : null}
              {u.headline ? (
                <p className="text-xs text-gc-fg-muted truncate mt-1">
                  {u.headline}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      {error ? (
        <p className="mt-3 text-xs text-gc-danger text-center" role="alert">
          {error}
        </p>
      ) : null}

      {cursor ? (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={isPending}
            className="px-4 py-1.5 rounded-full border border-gc-line text-sm text-gc-fg hover:bg-gc-bg-2 disabled:opacity-40"
          >
            {isPending ? tFeed("loading_more") : tFeed("load_more")}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function Avatar({ item }: { item: FollowListItem }) {
  const initial = (item.firstName ?? item.username ?? "?")
    .charAt(0)
    .toUpperCase();
  if (item.avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={item.avatarUrl}
        alt={displayName(item)}
        className="w-12 h-12 rounded-full object-cover border border-gc-line shrink-0"
      />
    );
  }
  return (
    <div
      aria-hidden
      className="w-12 h-12 rounded-full shrink-0 bg-gc-accent text-white flex items-center justify-center text-lg font-serif"
    >
      {initial}
    </div>
  );
}
