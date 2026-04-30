"use client";

import type { FeedItem as FeedItemType } from "@/lib/feed/types";
import type { User, Coin } from "@/lib/shared/types";
import { fmtPrice, fmtChange } from "@/lib/shared/format";
import { Avatar } from "@/components/shared/Avatar";
import { CoinBadge } from "@/components/shared/CoinBadge";
import { Spark } from "@/components/shared/Spark";
import {
  IconBookmark,
  IconBolt,
  IconSparkle,
  IconChat,
  IconShare,
  IconMore,
  IconTrust,
  IconTrustFilled,
  IconArrowUp,
  IconArrowDown,
} from "@/components/shared/icons";

// FeedItem è presentational puro: riceve user e coin già risolti come prop,
// così non dipende dai mock array e funziona con qualsiasi sorgente dati
// (mock, fetch, server-action, ecc.).

type FeedItemProps = {
  item: FeedItemType;
  user: User;
  /** Coin associata (presente per add_coin e price_alert) */
  coin?: Coin;
  onLike: (id: string) => void;
  onOpenCoin?: (sym: string) => void;
  onOpenUser?: (handle: string) => void;
};

export function FeedItem({
  item,
  user,
  coin,
  onLike,
  onOpenCoin,
  onOpenUser,
}: FeedItemProps) {
  return (
    <article className="bg-gc-bg-2 border border-gc-line rounded-gc p-5">
      {/* Action tag */}
      <div className="inline-flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.08em] text-gc-accent font-medium mb-3">
        {item.type === "add_coin" && (
          <>
            <IconBookmark size={11} sw={2} />
            <span>
              ha aggiunto a{" "}
              <em className="not-italic text-gc-fg">{item.watchlist}</em>
            </span>
          </>
        )}
        {item.type === "price_alert" && (
          <>
            <IconBolt size={11} sw={2} />
            <span className="inline-flex items-center gap-1">
              alert prezzo
              {item.direction === "up" ? (
                <IconArrowUp size={11} sw={2} />
              ) : (
                <IconArrowDown size={11} sw={2} />
              )}
              ${item.target.toLocaleString()}
            </span>
          </>
        )}
        {item.type === "new_watchlist" && (
          <>
            <IconSparkle size={11} sw={2} />
            <span>nuova watchlist</span>
          </>
        )}
      </div>

      {/* Header: avatar, autore, timestamp, more */}
      <div className="flex gap-3 items-start">
        <button
          type="button"
          onClick={() => onOpenUser?.(item.user)}
          aria-label={user.name}
        >
          <Avatar user={user} size={40} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5 flex-wrap text-sm">
            <button
              type="button"
              onClick={() => onOpenUser?.(item.user)}
              className="font-semibold hover:text-gc-accent transition"
            >
              {user.name}
            </button>
            <span className="text-gc-fg-3 font-mono text-xs">
              @{user.handle}
            </span>
            <span className="text-gc-fg-3">·</span>
            <span className="text-gc-fg-3 text-[12.5px]">{item.time}</span>
          </div>
        </div>
        <button
          type="button"
          aria-label="Altre opzioni"
          className="w-8 h-8 inline-flex items-center justify-center rounded-full text-gc-fg-3 hover:bg-gc-bg-3 hover:text-gc-fg transition"
        >
          <IconMore size={18} />
        </button>
      </div>

      {/* Nota dell'autore (opzionale) */}
      {item.note && (
        <p className="mt-3 text-gc-fg-2 text-sm leading-relaxed text-pretty">
          {item.note}
        </p>
      )}

      {/* Body — varia per tipo */}
      {item.type === "add_coin" && coin && (
        <CoinRow coin={coin} onOpen={() => onOpenCoin?.(item.coin)} />
      )}

      {item.type === "price_alert" && coin && (
        <PriceAlertRow
          coin={coin}
          direction={item.direction}
          target={item.target}
        />
      )}

      {item.type === "new_watchlist" && (
        <NewWatchlistRow
          watchlist={item.watchlist}
          coins={item.coins}
          onOpen={() => onOpenUser?.(item.user)}
        />
      )}

      {/* Footer azioni: fiducia, commenti, share, +Aggiungi */}
      <div className="mt-3.5 pt-3 border-t border-gc-line flex gap-5 items-center">
        <button
          type="button"
          onClick={() => onLike(item.id)}
          className={[
            "inline-flex items-center gap-1.5 px-2.5 py-1 border rounded-full text-[12.5px] tabular-nums transition",
            item.liked
              ? "border-gc-accent bg-gc-accent-soft text-gc-accent"
              : "border-gc-line text-gc-fg-3 hover:border-gc-accent hover:text-gc-accent",
          ].join(" ")}
        >
          {item.liked ? (
            <IconTrustFilled size={17} />
          ) : (
            <IconTrust size={17} />
          )}
          <span>{item.likes}</span>
          <span className="font-medium">Fiducia</span>
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 text-gc-fg-3 hover:text-gc-fg transition text-[12.5px] tabular-nums"
          aria-label={`${item.comments} commenti`}
        >
          <IconChat size={17} />
          <span>{item.comments}</span>
        </button>
        <button
          type="button"
          aria-label="Condividi"
          className="inline-flex items-center gap-1.5 text-gc-fg-3 hover:text-gc-fg transition"
        >
          <IconShare size={17} />
        </button>
        {(item.type === "add_coin" || item.type === "price_alert") && (
          <button
            type="button"
            onClick={() => onOpenCoin?.(item.coin)}
            className="ml-auto inline-flex items-center gap-1.5 text-gc-fg-3 hover:text-gc-fg transition text-[12.5px]"
          >
            <IconBookmark size={17} />
            <span className="font-medium">Aggiungi</span>
          </button>
        )}
      </div>
    </article>
  );
}

// ── Sub-componenti per il body, uno per variante ────────────────────────────

function CoinRow({ coin, onOpen }: { coin: Coin; onOpen: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="mt-3 bg-gc-bg-3 border border-gc-line rounded-gc-sm px-3.5 py-3 flex items-center gap-3 cursor-pointer hover:bg-gc-bg transition"
    >
      <CoinBadge sym={coin.sym} size={42} />
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm">{coin.name}</div>
        <div className="text-[11.5px] text-gc-fg-3 mt-px">{coin.cat}</div>
      </div>
      <Spark sym={coin.sym} change={coin.change} w={72} h={28} />
      <div className="text-right">
        <div className="font-mono font-medium text-[13.5px] tabular-nums">
          ${fmtPrice(coin.price)}
        </div>
        <div
          className={`font-mono text-[12.5px] font-medium tabular-nums ${
            coin.change >= 0 ? "text-gc-pos" : "text-gc-neg"
          }`}
        >
          {fmtChange(coin.change)}
        </div>
      </div>
    </div>
  );
}

function PriceAlertRow({
  coin,
  direction,
  target,
}: {
  coin: Coin;
  direction: "up" | "down";
  target: number;
}) {
  return (
    <div className="mt-3 bg-gc-accent-soft border border-[rgba(250,139,30,0.18)] rounded-gc-sm p-3.5 flex items-center gap-3.5">
      <CoinBadge sym={coin.sym} size={36} />
      <div className="flex-1">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-mono font-semibold tabular-nums">
            ${coin.sym}
          </span>
          <span className="text-gc-accent font-semibold inline-flex">
            {direction === "up" ? (
              <IconArrowUp size={14} sw={2.5} />
            ) : (
              <IconArrowDown size={14} sw={2.5} />
            )}
          </span>
          <span className="font-mono tabular-nums">
            target ${target.toLocaleString()}
          </span>
        </div>
        <div className="text-[12.5px] text-gc-fg-3 mt-1">
          ora{" "}
          <span className="font-mono tabular-nums">${fmtPrice(coin.price)}</span>
          <span
            className={`font-mono ml-2 tabular-nums ${
              coin.change >= 0 ? "text-gc-pos" : "text-gc-neg"
            }`}
          >
            {fmtChange(coin.change)}
          </span>
        </div>
      </div>
      <Spark sym={coin.sym} change={coin.change} w={64} h={32} />
    </div>
  );
}

function NewWatchlistRow({
  watchlist,
  coins,
  onOpen,
}: {
  watchlist: string;
  coins: string[];
  onOpen: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="mt-3 bg-gc-bg-3 border border-gc-line rounded-gc-sm p-3.5 flex items-center gap-3.5 cursor-pointer hover:bg-gc-bg transition"
    >
      <div className="w-10 h-10 rounded-[10px] bg-gc-green text-gc-bg-2 inline-flex items-center justify-center flex-shrink-0">
        <IconSparkle size={18} sw={2} />
      </div>
      <div className="flex-1">
        <div className="font-medium text-[14.5px]">{watchlist}</div>
        <div className="flex gap-1.5 items-center mt-1 flex-wrap">
          {coins.map((c) => (
            <span
              key={c}
              className="font-mono text-[11px] px-1.5 py-0.5 border border-gc-line rounded-full text-gc-fg-2"
            >
              ${c}
            </span>
          ))}
          <span className="text-[11.5px] text-gc-fg-3">
            {coins.length} coin
          </span>
        </div>
      </div>
    </div>
  );
}
