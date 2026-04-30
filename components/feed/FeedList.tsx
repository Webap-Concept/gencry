"use client";

import { useState } from "react";
import type { FeedItem as FeedItemType } from "@/lib/feed/types";
import { COINS, USERS } from "@/lib/shared/mock";
import { FeedFilters, type FeedFilter } from "./FeedFilters";
import { FeedItem } from "./FeedItem";

// Sezione "Attività recenti": filtri + lista di FeedItem.
// Tiene lo state del filtro e del like (toggle ottimistico).
// La risoluzione di user/coin avviene qui, FeedItem resta presentational.

type FeedListProps = {
  initialFeed: FeedItemType[];
  onOpenCoin?: (sym: string) => void;
  onOpenUser?: (handle: string) => void;
};

export function FeedList({
  initialFeed,
  onOpenCoin,
  onOpenUser,
}: FeedListProps) {
  const [feed, setFeed] = useState(initialFeed);
  const [filter, setFilter] = useState<FeedFilter>("Tutti");

  const visible = feed.filter((f) => {
    if (filter === "Tutti") return true;
    if (filter === "Aggiunte") return f.type === "add_coin";
    if (filter === "Alert") return f.type === "price_alert";
    if (filter === "Nuove watchlist") return f.type === "new_watchlist";
    return true;
  });

  // Toggle ottimistico della "fiducia" (in attesa della server action).
  const handleLike = (id: string) => {
    setFeed((items) =>
      items.map((i) =>
        i.id === id
          ? { ...i, liked: !i.liked, likes: i.likes + (i.liked ? -1 : 1) }
          : i,
      ),
    );
  };

  return (
    <section>
      <div className="flex flex-wrap justify-between items-center gap-3 mb-3.5">
        <h2 className="font-display font-normal text-[26px] tracking-[-0.01em] m-0">
          Attività recenti
        </h2>
        <FeedFilters active={filter} onChange={setFilter} />
      </div>

      <div className="flex flex-col gap-3.5">
        {visible.map((item) => {
          const user = USERS.find((u) => u.handle === item.user);
          if (!user) return null;
          const coin =
            "coin" in item
              ? COINS.find((c) => c.sym === item.coin)
              : undefined;
          return (
            <FeedItem
              key={item.id}
              item={item}
              user={user}
              coin={coin}
              onLike={handleLike}
              onOpenCoin={onOpenCoin}
              onOpenUser={onOpenUser}
            />
          );
        })}
        {visible.length > 0 && (
          <div className="text-center py-5 text-gc-fg-3 text-xs font-mono tracking-wider">
            <span>· sei in pari ·</span>
          </div>
        )}
        {visible.length === 0 && (
          <div className="text-center py-10 text-gc-fg-3 text-sm">
            Nessuna attività in questa categoria.
          </div>
        )}
      </div>
    </section>
  );
}
