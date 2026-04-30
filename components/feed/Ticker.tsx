"use client";

import { useState } from "react";
import { COINS } from "@/lib/shared/mock";
import { fmtPrice, fmtChange } from "@/lib/shared/format";
import { Spark } from "@/components/shared/Spark";
import { IconChevronRight } from "@/components/shared/icons";

// Banner watchlist scuro (gc-fg) con scroll orizzontale; espandibile per
// mostrare tutte le coin invece delle prime 6.

type TickerProps = {
  onOpenCoin?: (sym: string) => void;
};

export function Ticker({ onOpenCoin }: TickerProps) {
  const [expanded, setExpanded] = useState(false);
  const collapsed = COINS.slice(0, 6);
  const items = expanded ? COINS : collapsed;
  const hidden = COINS.length - collapsed.length;

  return (
    <div className="bg-gc-fg text-gc-bg rounded-gc px-4 py-3.5 mb-5 flex flex-col gap-2.5 overflow-hidden">
      <div className="flex items-center justify-between gap-4">
        <div className="font-display italic text-[18px] flex-shrink-0">
          Watchlist
        </div>
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="bg-transparent border border-[rgba(245,236,220,0.25)] text-gc-bg px-2.5 py-1 rounded-full text-[11.5px] inline-flex items-center gap-1.5 transition hover:bg-[rgba(245,236,220,0.1)]"
        >
          {expanded ? "Comprimi" : `+ ${hidden} altre`}
          <span
            className={`inline-flex transition-transform ${
              expanded ? "-rotate-90" : "rotate-90"
            }`}
          >
            <IconChevronRight size={12} sw={2} />
          </span>
        </button>
      </div>
      <div
        className={[
          "flex gap-2 flex-1 no-scrollbar",
          expanded ? "flex-wrap" : "overflow-x-auto",
        ].join(" ")}
      >
        {items.map((c) => (
          <button
            key={c.sym}
            type="button"
            onClick={() => onOpenCoin?.(c.sym)}
            aria-label={`Apri ${c.name} — ${c.change >= 0 ? "+" : ""}${c.change.toFixed(1)}% nelle ultime 24 ore`}
            className="inline-flex items-center gap-2 bg-[rgba(245,236,220,0.08)] text-gc-bg px-3 py-1.5 rounded-full flex-shrink-0 transition hover:bg-[rgba(245,236,220,0.16)]"
          >
            <span className="font-mono font-semibold text-xs tabular-nums">
              {c.sym}
            </span>
            <span className="font-mono text-xs tabular-nums">
              ${fmtPrice(c.price)}
            </span>
            <span
              className={`font-mono text-[11px] font-medium tabular-nums ${
                c.change >= 0 ? "text-gc-green" : "text-[#e89886]"
              }`}
            >
              {fmtChange(c.change)}
            </span>
            <Spark
              sym={c.sym}
              change={c.change}
              w={36}
              h={16}
              color={c.change >= 0 ? "var(--gc-green)" : "#e89886"}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
