"use client";

import { AdminToast } from "@/app/(admin)/admin/_components/toast";
import type { Coin } from "@/lib/db/schema";
import type { PriceRow } from "@/lib/prices/queries";
import { Loader2, Plus, RefreshCw, ToggleLeft, ToggleRight, Trash2 } from "lucide-react";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import {
  addCoinAction,
  deleteCoinAction,
  refetchCoinAction,
  toggleCoinActiveAction,
  type ActionState,
} from "../actions";

interface Props {
  coins: Coin[];
  priceMap: Record<string, PriceRow>;
}

export function CoinsRegistry({ coins, priceMap }: Props) {
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [addState, addAction, isAdding] = useActionState<ActionState, FormData>(addCoinAction, {});
  const lastTs = useRef<number>(0);

  useEffect(() => {
    if (!("timestamp" in addState)) return;
    if (addState.timestamp === lastTs.current) return;
    lastTs.current = addState.timestamp;
    if ("success" in addState && addState.success) {
      setToast({ message: addState.success, type: "success" });
    } else if ("error" in addState && addState.error) {
      setToast({ message: addState.error, type: "error" });
    }
  }, [addState]);

  return (
    <>
      <div className="space-y-5">
        {/* Add coin */}
        <div
          className="rounded-xl shadow-sm p-6"
          style={{
            background: "var(--admin-card-bg)",
            border: "1px solid var(--admin-card-border)",
          }}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: "var(--admin-text)" }}>
            Add coin
          </h3>
          <form action={addAction} className="flex items-end gap-3 max-w-lg">
            <div className="flex-1">
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--admin-text-muted)" }}>
                CoinGecko ID
              </label>
              <input
                name="coingecko_id"
                placeholder="bitcoin, ethereum, solana..."
                required
                className="w-full px-3 py-2 text-sm rounded-lg focus:outline-none transition-colors font-mono"
                style={{
                  background: "var(--admin-page-bg)",
                  border: "1px solid var(--admin-input-border)",
                  color: "var(--admin-text)",
                }}
              />
              <p className="text-[11px] mt-1" style={{ color: "var(--admin-text-faint)" }}>
                The lower-case ID from coingecko.com/en/coins/&lt;id&gt;.
              </p>
            </div>
            <button
              type="submit"
              disabled={isAdding}
              className="flex items-center gap-1.5 px-4 py-2 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60"
              style={{ background: "var(--admin-accent)" }}>
              {isAdding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              {isAdding ? "Adding..." : "Add"}
            </button>
          </form>
        </div>

        {/* Coins table */}
        <div
          className="rounded-xl shadow-sm p-6"
          style={{
            background: "var(--admin-card-bg)",
            border: "1px solid var(--admin-card-border)",
          }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold" style={{ color: "var(--admin-text)" }}>
              Tracked coins ({coins.length})
            </h3>
          </div>
          <div className="overflow-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ color: "var(--admin-text-faint)" }}>
                  <th className="text-left font-medium py-2 px-2">Symbol</th>
                  <th className="text-left font-medium py-2 px-2">Name</th>
                  <th className="text-right font-medium py-2 px-2">Market cap</th>
                  <th className="text-right font-medium py-2 px-2">Price</th>
                  <th className="text-right font-medium py-2 px-2">24h</th>
                  <th className="text-left font-medium py-2 px-2">Last seen</th>
                  <th className="text-center font-medium py-2 px-2">Active</th>
                  <th className="text-right font-medium py-2 px-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {coins.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-6 text-center" style={{ color: "var(--admin-text-faint)" }}>
                      No coins yet. Add one above.
                    </td>
                  </tr>
                )}
                {coins.map((c) => (
                  <CoinRow
                    key={c.symbol}
                    coin={c}
                    price={priceMap[c.symbol]}
                    onToast={setToast}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {toast && <AdminToast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
    </>
  );
}

function CoinRow({
  coin,
  price,
  onToast,
}: {
  coin: Coin;
  price: PriceRow | undefined;
  onToast: (t: { message: string; type: "success" | "error" }) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [busyAction, setBusyAction] = useState<"refetch" | "toggle" | "delete" | null>(null);

  function handleResult(state: ActionState) {
    if ("success" in state && state.success) onToast({ message: state.success, type: "success" });
    else if ("error" in state && state.error) onToast({ message: state.error, type: "error" });
  }

  function refetch() {
    setBusyAction("refetch");
    startTransition(async () => {
      handleResult(await refetchCoinAction(coin.symbol));
      setBusyAction(null);
    });
  }
  function toggle() {
    setBusyAction("toggle");
    startTransition(async () => {
      handleResult(await toggleCoinActiveAction(coin.symbol, !coin.isActive));
      setBusyAction(null);
    });
  }
  function remove() {
    if (!confirm(`Remove ${coin.symbol} from registry? This deletes its price history.`)) return;
    setBusyAction("delete");
    startTransition(async () => {
      handleResult(await deleteCoinAction(coin.symbol));
      setBusyAction(null);
    });
  }

  const change = price?.change24h ?? null;
  const changeColor = change === null ? "var(--admin-text-faint)" : change >= 0 ? "var(--gc-pos, #16a34a)" : "var(--gc-neg, #dc2626)";

  return (
    <tr style={{ borderTop: "1px solid var(--admin-input-border)" }}>
      <td className="py-2 px-2">
        <div className="flex items-center gap-2">
          {coin.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={coin.imageUrl} alt={coin.symbol} className="w-5 h-5 rounded-full" />
          )}
          <span className="font-mono font-semibold" style={{ color: "var(--admin-text)" }}>
            {coin.symbol}
          </span>
        </div>
      </td>
      <td className="py-2 px-2" style={{ color: "var(--admin-text-muted)" }}>{coin.name}</td>
      <td className="py-2 px-2 text-right font-mono" style={{ color: "var(--admin-text-muted)" }}>
        {coin.marketCap !== null ? formatCompact(coin.marketCap) : "—"}
      </td>
      <td className="py-2 px-2 text-right font-mono" style={{ color: "var(--admin-text)" }}>
        {price ? `$${formatPrice(price.price)}` : "—"}
      </td>
      <td className="py-2 px-2 text-right font-mono" style={{ color: changeColor }}>
        {change !== null ? `${change >= 0 ? "+" : ""}${change.toFixed(2)}%` : "—"}
      </td>
      <td className="py-2 px-2 font-mono" style={{ color: "var(--admin-text-faint)" }}>
        {coin.lastSeenAt.toLocaleString()}
      </td>
      <td className="py-2 px-2 text-center">
        <button
          type="button"
          onClick={toggle}
          disabled={isPending}
          className="inline-flex items-center transition-colors disabled:opacity-60"
          title={coin.isActive ? "Click to deactivate" : "Click to activate"}>
          {busyAction === "toggle" ? (
            <Loader2 size={14} className="animate-spin" />
          ) : coin.isActive ? (
            <ToggleRight size={18} style={{ color: "var(--gc-pos, #16a34a)" }} />
          ) : (
            <ToggleLeft size={18} style={{ color: "var(--admin-text-faint)" }} />
          )}
        </button>
      </td>
      <td className="py-2 px-2 text-right">
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={refetch}
            disabled={isPending}
            className="p-1.5 rounded transition-colors disabled:opacity-60"
            style={{ border: "1px solid var(--admin-input-border)", color: "var(--admin-text-muted)" }}
            title="Refresh metadata from CoinGecko">
            {busyAction === "refetch" ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <RefreshCw size={12} />
            )}
          </button>
          <button
            type="button"
            onClick={remove}
            disabled={isPending}
            className="p-1.5 rounded transition-colors disabled:opacity-60"
            style={{ border: "1px solid var(--admin-input-border)", color: "var(--gc-neg, #dc2626)" }}
            title="Delete coin">
            {busyAction === "delete" ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Trash2 size={12} />
            )}
          </button>
        </div>
      </td>
    </tr>
  );
}

function formatCompact(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9)  return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6)  return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3)  return `$${(n / 1e3).toFixed(2)}K`;
  return `$${n.toFixed(0)}`;
}

function formatPrice(n: number): string {
  if (n >= 1) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (n >= 0.01) return n.toFixed(4);
  return n.toFixed(8);
}
