"use client";

import { AdminToast } from "@/app/(admin)/admin/_components/toast";
import type { PricesCoin } from "@/lib/db/schema";
import type { PriceRow } from "@/lib/modules/prices/queries";
import { CloudUpload, ChevronLeft, ChevronRight, Download, Loader2, Plus, RefreshCw, Search, ToggleLeft, ToggleRight, Trash2, X } from "lucide-react";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import {
  addCoinAction,
  backfillCoinImagesAction,
  bulkImportTopCoinsAction,
  deleteCoinAction,
  refetchCoinAction,
  toggleCoinActiveAction,
  type ActionState,
} from "../actions";

interface Props {
  coins: PricesCoin[];
  priceMap: Record<string, PriceRow>;
}

const PAGE_SIZE = 20;

export function CoinsRegistry({ coins, priceMap }: Props) {
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [addState, addAction, isAdding] = useActionState<ActionState, FormData>(addCoinAction, {});
  const [isBackfilling, startBackfill] = useTransition();
  const lastTs = useRef<number>(0);

  function handleBackfill() {
    startBackfill(async () => {
      const res = await backfillCoinImagesAction();
      if ("success" in res && res.success) setToast({ message: res.success, type: "success" });
      if ("error" in res && res.error) setToast({ message: res.error, type: "error" });
    });
  }

  // Search + pagination (client-side: la lista in admin sta tipicamente sotto
  // i 200 elementi, niente bisogno di paginazione server-side per ora).
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const filtered = (() => {
    const q = query.trim().toLowerCase();
    if (!q) return coins;
    return coins.filter(
      (c) =>
        c.symbol.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q) ||
        (c.coingeckoId ?? "").toLowerCase().includes(q),
    );
  })();

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageCoins = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // Reset alla pagina 1 quando cambia la query
  useEffect(() => {
    setPage(1);
  }, [query]);

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
          {/* items-start + mt-6 (24px = label height ~18 + mb-1.5 ~6) per
           *  allineare il button al top dell'input, non al hint sotto. */}
          <form action={addAction} className="flex items-start gap-3 max-w-lg">
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
              className="flex items-center gap-1.5 px-4 py-2 mt-6 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60"
              style={{ background: "var(--admin-accent)" }}>
              {isAdding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              {isAdding ? "Adding..." : "Add"}
            </button>
          </form>
        </div>

        {/* Import top coins */}
        <BulkImportCard onToast={setToast} />

        {/* Coins table */}
        <div
          className="rounded-xl shadow-sm p-6"
          style={{
            background: "var(--admin-card-bg)",
            border: "1px solid var(--admin-card-border)",
          }}>
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <h3 className="text-sm font-semibold" style={{ color: "var(--admin-text)" }}>
              Tracked coins
              {query ? (
                <span className="font-normal" style={{ color: "var(--admin-text-faint)" }}>
                  {" "}— {filtered.length} of {coins.length}
                </span>
              ) : (
                <span className="font-normal" style={{ color: "var(--admin-text-faint)" }}> ({coins.length})</span>
              )}
            </h3>
            <button
              type="button"
              onClick={handleBackfill}
              disabled={isBackfilling}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              style={{
                background: "transparent",
                color: "var(--admin-text-muted)",
                border: "1px solid var(--admin-input-border)",
              }}
              title="Re-mirror all coin images from CoinGecko to R2 (skips coins already on R2)">
              {isBackfilling ? <Loader2 size={12} className="animate-spin" /> : <CloudUpload size={12} />}
              {isBackfilling ? "Backfilling..." : "Backfill images to R2"}
            </button>
            <div className="relative w-full max-w-sm">
              <Search
                size={13}
                className="absolute left-2.5 top-1/2 -translate-y-1/2"
                style={{ color: "var(--admin-text-faint)" }}
              />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by symbol, name, or CoinGecko ID..."
                className="w-full pl-8 pr-8 py-2 text-xs rounded-lg focus:outline-none transition-colors"
                style={{
                  background: "var(--admin-page-bg)",
                  border: "1px solid var(--admin-input-border)",
                  color: "var(--admin-text)",
                }}
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2"
                  style={{ color: "var(--admin-text-faint)" }}
                  title="Clear search">
                  <X size={13} />
                </button>
              )}
            </div>
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
                {coins.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-6 text-center" style={{ color: "var(--admin-text-faint)" }}>
                      No coins yet. Add one above.
                    </td>
                  </tr>
                ) : pageCoins.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-6 text-center" style={{ color: "var(--admin-text-faint)" }}>
                      No coins match "{query}".
                    </td>
                  </tr>
                ) : (
                  pageCoins.map((c) => (
                    <CoinRow
                      key={c.symbol}
                      coin={c}
                      price={priceMap[c.symbol]}
                      onToast={setToast}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {filtered.length > PAGE_SIZE && (
            <div className="flex items-center justify-between mt-4 pt-3 text-xs" style={{
              borderTop: "1px solid var(--admin-input-border)",
              color: "var(--admin-text-faint)",
            }}>
              <span>
                Page {safePage} of {totalPages} · showing {pageCoins.length} of {filtered.length}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage === 1}
                  className="flex items-center gap-1 px-2 py-1 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    border: "1px solid var(--admin-input-border)",
                    color: "var(--admin-text)",
                  }}>
                  <ChevronLeft size={12} /> Prev
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage === totalPages}
                  className="flex items-center gap-1 px-2 py-1 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    border: "1px solid var(--admin-input-border)",
                    color: "var(--admin-text)",
                  }}>
                  Next <ChevronRight size={12} />
                </button>
              </div>
            </div>
          )}
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
  coin: PricesCoin;
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

function BulkImportCard({
  onToast,
}: {
  onToast: (t: { message: string; type: "success" | "error" }) => void;
}) {
  const [perPage, setPerPage] = useState<number>(50);
  const [page, setPage] = useState<number>(1);
  const [updateExisting, setUpdateExisting] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleImport() {
    startTransition(async () => {
      const res = await bulkImportTopCoinsAction(perPage, page, updateExisting);
      if ("success" in res && res.success) onToast({ message: res.success, type: "success" });
      else if ("error" in res && res.error) onToast({ message: res.error, type: "error" });
    });
  }

  const rangeFrom = (page - 1) * perPage + 1;
  const rangeTo = page * perPage;

  return (
    <div
      className="rounded-xl shadow-sm p-6"
      style={{
        background: "var(--admin-card-bg)",
        border: "1px solid var(--admin-card-border)",
      }}>
      <h3 className="text-sm font-semibold mb-1" style={{ color: "var(--admin-text)" }}>
        Import top coins
      </h3>
      <p className="text-[11px] mb-5" style={{ color: "var(--admin-text-faint)" }}>
        Pull the top N coins by market cap from CoinGecko in one shot (1 API call + mirror to R2).
        Existing symbols are skipped by default. Currently importing rows{" "}
        <span className="font-mono" style={{ color: "var(--admin-text-muted)" }}>
          {rangeFrom}–{rangeTo}
        </span>{" "}
        of the global market cap ranking.
      </p>
      <div className="flex flex-wrap items-end gap-3 max-w-2xl">
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--admin-text-muted)" }}>
            Top N
          </label>
          <select
            value={perPage}
            onChange={(e) => setPerPage(Number(e.target.value))}
            disabled={isPending}
            className="px-3 py-2 text-sm rounded-lg focus:outline-none transition-colors font-mono disabled:opacity-60"
            style={{
              background: "var(--admin-page-bg)",
              border: "1px solid var(--admin-input-border)",
              color: "var(--admin-text)",
            }}>
            {[10, 25, 50, 100, 250].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--admin-text-muted)" }}>
            Page
          </label>
          <input
            type="number"
            min={1}
            max={50}
            value={page}
            onChange={(e) => setPage(Math.max(1, Number(e.target.value) || 1))}
            disabled={isPending}
            className="w-20 px-3 py-2 text-sm rounded-lg focus:outline-none transition-colors font-mono disabled:opacity-60"
            style={{
              background: "var(--admin-page-bg)",
              border: "1px solid var(--admin-input-border)",
              color: "var(--admin-text)",
            }}
          />
        </div>
        <label
          className="flex items-center gap-2 text-xs cursor-pointer select-none"
          style={{ color: "var(--admin-text-muted)", marginBottom: 9 }}>
          <input
            type="checkbox"
            checked={updateExisting}
            onChange={(e) => setUpdateExisting(e.target.checked)}
            disabled={isPending}
            className="w-4 h-4 rounded"
            style={{ accentColor: "var(--admin-accent)" }}
          />
          Update existing too
        </label>
        <button
          type="button"
          onClick={handleImport}
          disabled={isPending}
          className="flex items-center gap-1.5 px-4 py-2 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          style={{ background: "var(--admin-accent)" }}>
          {isPending ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          {isPending ? "Importing..." : "Import"}
        </button>
      </div>
      <p className="text-[11px] mt-3" style={{ color: "var(--admin-text-faint)" }}>
        Tip: with CoinGecko Pro enabled the rate limits are higher and the call is faster. Without
        Pro, allow up to ~60s for a batch of 250.
      </p>
    </div>
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
