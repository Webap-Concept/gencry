"use client";

import { COINS, USERS } from "@/lib/shared/mock";
import { fmtPrice, fmtChange } from "@/lib/shared/format";
import { CoinBadge } from "@/components/shared/CoinBadge";
import { Avatar } from "@/components/shared/Avatar";
import { Spark } from "@/components/shared/Spark";

// Tre "moments" sopra il feed: top mover, flop, persona da seguire.
// Le card hanno gradient di accento coerente con il tipo (verde/rosso/arancio).

type MomentsProps = {
  onOpenCoin?: (sym: string) => void;
  onOpenUser?: (handle: string) => void;
};

export function Moments({ onOpenCoin, onOpenUser }: MomentsProps) {
  const top = [...COINS].sort((a, b) => b.change - a.change)[0];
  const flop = [...COINS].sort((a, b) => a.change - b.change)[0];
  const trendingUser =
    USERS.find((u) => u.handle === "degenale") ?? USERS[0];

  const cardBase =
    "bg-gc-bg-2 border border-gc-line rounded-gc p-4 flex flex-col gap-2.5 text-left cursor-pointer transition hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(18,57,40,0.06)]";

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-7">
      {/* Top mover */}
      <button
        type="button"
        onClick={() => onOpenCoin?.(top.sym)}
        className={cardBase}
        style={{
          background:
            "linear-gradient(150deg, var(--gc-bg-2) 60%, rgba(120, 180, 145, 0.12) 100%)",
        }}
      >
        <div className="text-[10.5px] uppercase tracking-[0.08em] text-gc-fg-3">
          Top mover · 24h
        </div>
        <div className="flex items-center gap-3">
          <CoinBadge sym={top.sym} size={36} />
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-medium text-gc-fg">{top.name}</div>
            <div className="text-[11.5px] text-gc-fg-3">{top.cat}</div>
          </div>
          <div className="font-mono text-base font-medium text-gc-pos tabular-nums">
            {fmtChange(top.change)}
          </div>
        </div>
        <Spark
          sym={top.sym}
          change={top.change}
          w={300}
          h={42}
          color="var(--gc-pos)"
        />
        <div className="flex justify-between items-center mt-auto">
          <span className="font-mono text-xs text-gc-fg-3 tabular-nums">
            ${fmtPrice(top.price)}
          </span>
          <span className="text-[12.5px] text-gc-fg font-medium">Apri →</span>
        </div>
      </button>

      {/* Flop */}
      <button
        type="button"
        onClick={() => onOpenCoin?.(flop.sym)}
        className={cardBase}
        style={{
          background:
            "linear-gradient(150deg, var(--gc-bg-2) 60%, rgba(194, 85, 63, 0.08) 100%)",
        }}
      >
        <div className="text-[10.5px] uppercase tracking-[0.08em] text-gc-fg-3">
          In calo · 24h
        </div>
        <div className="flex items-center gap-3">
          <CoinBadge sym={flop.sym} size={36} />
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-medium text-gc-fg">{flop.name}</div>
            <div className="text-[11.5px] text-gc-fg-3">{flop.cat}</div>
          </div>
          <div className="font-mono text-base font-medium text-gc-neg tabular-nums">
            {fmtChange(flop.change)}
          </div>
        </div>
        <Spark
          sym={flop.sym}
          change={flop.change}
          w={300}
          h={42}
          color="var(--gc-neg)"
        />
        <div className="flex justify-between items-center mt-auto">
          <span className="font-mono text-xs text-gc-fg-3 tabular-nums">
            ${fmtPrice(flop.price)}
          </span>
          <span className="text-[12.5px] text-gc-fg font-medium">Apri →</span>
        </div>
      </button>

      {/* Persona da seguire */}
      <button
        type="button"
        onClick={() => onOpenUser?.(trendingUser.handle)}
        className={`${cardBase} col-span-1 sm:col-span-2`}
        style={{
          background:
            "linear-gradient(150deg, var(--gc-bg-2) 50%, rgba(250, 139, 30, 0.08) 100%)",
        }}
      >
        <div className="text-[10.5px] uppercase tracking-[0.08em] text-gc-fg-3">
          Da seguire
        </div>
        <div className="flex items-start gap-3">
          <Avatar user={trendingUser} size={48} />
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-medium text-gc-fg">
              {trendingUser.name}
            </div>
            <div className="text-[11.5px] text-gc-fg-3">
              @{trendingUser.handle} ·{" "}
              {trendingUser.followers.toLocaleString()} follower
            </div>
            <p className="text-[12.5px] text-gc-fg-2 mt-1.5 leading-snug">
              {trendingUser.bio}
            </p>
          </div>
        </div>
        <div className="flex justify-end mt-auto">
          <span className="text-[12.5px] text-gc-accent font-medium">
            + Segui
          </span>
        </div>
      </button>
    </div>
  );
}
