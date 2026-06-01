"use client";
import { useState, useTransition } from "react";
import { ShoppingBag } from "lucide-react";
import { redeemCatalogItem } from "@/lib/modules/rewards/redeem";
import { formatCoins } from "@/lib/modules/rewards/format";
import type { RedeemableItem } from "@/lib/modules/rewards/catalog-queries";

export function ShopSection({
  items,
  currentBalance,
}: {
  items: RedeemableItem[];
  currentBalance: number;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <ShoppingBag size={16} className="text-gc-fg-3" strokeWidth={1.6} />
        <h2 className="text-base font-semibold text-gc-fg">Negozio GCC</h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.map((item) => (
          <ShopCard key={item.id} item={item} canAfford={currentBalance >= parseFloat(item.costGcc as unknown as string)} />
        ))}
      </div>
    </section>
  );
}

function ShopCard({ item, canAfford }: { item: RedeemableItem; canAfford: boolean }) {
  const cost = parseFloat(item.costGcc as unknown as string);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  function handleBuy() {
    if (!confirmed) { setConfirmed(true); return; }
    setConfirmed(false);
    startTransition(async () => {
      const res = await redeemCatalogItem(item.slug);
      setResult({ ok: res.ok, msg: res.ok ? (res as { message: string }).message : (res as { error: string }).error });
    });
  }

  const owned = item.alreadyOwned;

  return (
    <div className="rounded-2xl border border-gc-line bg-gc-bg p-4 flex flex-col gap-3">
      {/* Icona */}
      <div className="flex items-start justify-between">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center overflow-hidden shrink-0"
          style={{ background: item.iconBg ?? "#888" }}
        >
          {item.iconUrl ? (
            <img src={item.iconUrl} alt={item.label} className="w-full h-full object-contain" />
          ) : (
            <span className="text-white text-xl font-bold">{item.label[0]}</span>
          )}
        </div>
        <span
          className="text-xs font-mono px-2 py-0.5 rounded-full"
          style={{ background: "var(--gc-bg-2, #f5f0e8)", color: "var(--gc-fg-3)" }}
        >
          {item.type}
        </span>
      </div>

      {/* Info */}
      <div>
        <div className="text-[15px] font-semibold text-gc-fg">{item.label}</div>
        {item.description && (
          <div className="text-xs text-gc-fg-3 mt-0.5 leading-relaxed">{item.description}</div>
        )}
      </div>

      {/* Costo + CTA */}
      <div className="mt-auto space-y-2">
        <div className="flex items-baseline gap-1.5">
          <span className="text-xl font-bold tabular-nums text-gc-fg">{formatCoins(cost)}</span>
          <span className="text-sm text-gc-fg-3">GCC</span>
        </div>

        {result ? (
          <p className={`text-xs font-medium ${result.ok ? "text-emerald-600" : "text-red-600"}`}>
            {result.msg}
          </p>
        ) : owned ? (
          <div className="text-xs text-gc-fg-3 font-medium flex items-center gap-1">
            <span className="text-emerald-500">✓</span> Già acquistato
          </div>
        ) : (
          <button
            type="button"
            disabled={pending || !canAfford}
            onClick={handleBuy}
            className={[
              "w-full rounded-xl py-2 text-sm font-semibold transition",
              confirmed
                ? "bg-orange-500 text-white"
                : canAfford
                  ? "bg-gc-bg-2 text-gc-fg hover:bg-gc-bg-3"
                  : "bg-gc-bg-2 text-gc-fg-3 cursor-not-allowed opacity-60",
            ].join(" ")}
          >
            {pending ? "Acquisto…" : confirmed ? `Conferma −${formatCoins(cost)} GCC` : canAfford ? "Acquista" : "GCC insufficienti"}
          </button>
        )}
      </div>
    </div>
  );
}
