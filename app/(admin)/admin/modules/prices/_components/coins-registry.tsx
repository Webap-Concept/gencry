"use client";

import { AdminToast } from "@/app/(admin)/admin/_components/toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { PricesCoin } from "@/lib/db/schema";
import type { PriceRow } from "@/lib/modules/prices/queries";
import {
  CloudUpload,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ToggleLeft,
  ToggleRight,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import {
  addCoinAction,
  backfillCoinImagesAction,
  backfillHistoryAction,
  bulkImportTopCoinsAction,
  deleteCoinAction,
  refetchAllCoinsAction,
  refetchCoinAction,
  toggleCoinActiveAction,
  type ActionState,
} from "../actions";

interface Props {
  coins: PricesCoin[];
  priceMap: Record<string, PriceRow>;
  /** Path admin base per la registry (dipende dallo slug admin configurabile,
   *  es. `/control-panel/modules/prices/coins`). Calcolato server-side. */
  adminCoinsPath: string;
}

const PAGE_SIZE = 20;

export function CoinsRegistry({ coins, priceMap, adminCoinsPath }: Props) {
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [addState, addAction, isAdding] = useActionState<ActionState, FormData>(addCoinAction, {});
  const [isBackfilling, startBackfill] = useTransition();
  const [isRefreshingAll, startRefreshAll] = useTransition();
  const [isBackfillingHistory, startBackfillHistory] = useTransition();
  const [historyDays, setHistoryDays] = useState<number>(365);
  const lastTs = useRef<number>(0);

  function handleBackfill() {
    startBackfill(async () => {
      const res = await backfillCoinImagesAction();
      if ("success" in res && res.success) setToast({ message: res.success, type: "success" });
      if ("error" in res && res.error) setToast({ message: res.error, type: "error" });
    });
  }

  function handleRefreshAll() {
    if (
      !window.confirm(
        "Re-fetch metadata + images for every coin? Takes ~1.5s per coin (CoinGecko rate limit).",
      )
    )
      return;
    startRefreshAll(async () => {
      const res = await refetchAllCoinsAction();
      if ("success" in res && res.success) setToast({ message: res.success, type: "success" });
      if ("error" in res && res.error) setToast({ message: res.error, type: "error" });
    });
  }

  function handleBackfillHistory() {
    if (
      !window.confirm(
        `Backfill ${historyDays}gg di storico prezzi da CryptoCompare per ogni coin? ` +
          `Sovrascrive solo i punti vecchi arrotondati (con decimali = 0). ` +
          `Può richiedere alcuni minuti.`,
      )
    )
      return;
    startBackfillHistory(async () => {
      // Granularità mista: ultimi 30gg orari, il resto giornaliero.
      const hourDays = Math.min(30, historyDays);
      const res = await backfillHistoryAction(historyDays, hourDays);
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
    <TooltipProvider delayDuration={200}>
      <div className="space-y-5">
        {/* Add coin + Import top coins: side by side su md+, stack mobile. */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
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
        </div>

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
            <MaintenanceMenu
              isBackfilling={isBackfilling}
              isRefreshingAll={isRefreshingAll}
              isBackfillingHistory={isBackfillingHistory}
              historyDays={historyDays}
              onHistoryDaysChange={setHistoryDays}
              onBackfillImages={handleBackfill}
              onRefreshMetadata={handleRefreshAll}
              onBackfillHistory={handleBackfillHistory}
            />
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
                      adminCoinsPath={adminCoinsPath}
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
    </TooltipProvider>
  );
}

function CoinRow({
  coin,
  price,
  adminCoinsPath,
  onToast,
}: {
  coin: PricesCoin;
  price: PriceRow | undefined;
  adminCoinsPath: string;
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

  const drilldownHref = `${adminCoinsPath}/${coin.symbol.toLowerCase()}`;

  return (
    <tr
      style={{ borderTop: "1px solid var(--admin-input-border)" }}
      className="hover:bg-[color-mix(in_srgb,var(--admin-page-bg)_60%,transparent)] transition-colors">
      <td className="py-2 px-2">
        <Link href={drilldownHref} className="flex items-center gap-2 group">
          {coin.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={coin.imageUrl} alt={`${coin.name} logo`} className="w-5 h-5 rounded-full" />
          )}
          <span
            className="font-mono font-semibold group-hover:underline"
            style={{ color: "var(--admin-text)" }}>
            {coin.symbol}
          </span>
        </Link>
      </td>
      <td className="py-2 px-2">
        <Link
          href={drilldownHref}
          className="hover:underline"
          style={{ color: "var(--admin-text-muted)" }}>
          {coin.name}
        </Link>
      </td>
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
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={toggle}
              disabled={isPending}
              aria-label={coin.isActive ? "Disattiva coin" : "Attiva coin"}
              className="inline-flex items-center transition-colors disabled:opacity-60">
              {busyAction === "toggle" ? (
                <Loader2 size={14} className="animate-spin" />
              ) : coin.isActive ? (
                <ToggleRight size={18} style={{ color: "var(--gc-pos, #16a34a)" }} />
              ) : (
                <ToggleLeft size={18} style={{ color: "var(--admin-text-faint)" }} />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">
            {coin.isActive ? "Disattiva (esclude dal cron sync)" : "Attiva (include nel cron sync)"}
          </TooltipContent>
        </Tooltip>
      </td>
      <td className="py-2 px-2 text-right">
        <div className="flex items-center justify-end gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                href={drilldownHref}
                aria-label="Apri dettaglio coin"
                className="p-1.5 rounded transition-colors inline-flex items-center"
                style={{ border: "1px solid var(--admin-input-border)", color: "var(--admin-text-muted)" }}>
                <ExternalLink size={12} />
              </Link>
            </TooltipTrigger>
            <TooltipContent side="top">Apri dettaglio (storico, stats, gap)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={refetch}
                disabled={isPending}
                aria-label="Refresh metadata da CoinGecko"
                className="p-1.5 rounded transition-colors disabled:opacity-60"
                style={{ border: "1px solid var(--admin-input-border)", color: "var(--admin-text-muted)" }}>
                {busyAction === "refetch" ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <RefreshCw size={12} />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">Refresh metadata da CoinGecko</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={remove}
                disabled={isPending}
                aria-label="Elimina coin"
                className="p-1.5 rounded transition-colors disabled:opacity-60"
                style={{ border: "1px solid var(--admin-input-border)", color: "var(--gc-neg, #dc2626)" }}>
                {busyAction === "delete" ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Trash2 size={12} />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">Elimina dal registry (cancella anche lo storico)</TooltipContent>
          </Tooltip>
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
  const [mode, setMode] = useState<"skip" | "update">("skip");
  const [isPending, startTransition] = useTransition();

  function handleImport() {
    startTransition(async () => {
      const res = await bulkImportTopCoinsAction(perPage, page, mode === "update");
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
        Importa N coin dalla classifica market cap di CoinGecko. Scegli la
        posizione iniziale e il numero di coin. Idempotente: ri-eseguibile.
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
            Pagina
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
      </div>

      <div className="mt-4">
        <div
          className="text-xs font-medium mb-2"
          style={{ color: "var(--admin-text-muted)" }}>
          Se il coin esiste già nel registry
        </div>
        <RadioGroup
          value={mode}
          onValueChange={(v) => setMode(v as "skip" | "update")}
          disabled={isPending}
          className="flex flex-col gap-2">
          <label className="flex items-start gap-2 cursor-pointer">
            <RadioGroupItem value="skip" id="import-mode-skip" className="mt-0.5" />
            <span className="text-xs" style={{ color: "var(--admin-text)" }}>
              <span className="font-medium">Skip existing</span>{" "}
              <span style={{ color: "var(--admin-text-faint)" }}>
                — non modifica i coin già presenti, importa solo i nuovi
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 cursor-pointer">
            <RadioGroupItem value="update" id="import-mode-update" className="mt-0.5" />
            <span className="text-xs" style={{ color: "var(--admin-text)" }}>
              <span className="font-medium">Update existing</span>{" "}
              <span style={{ color: "var(--admin-text-faint)" }}>
                — sovrascrive nome, market cap, immagine dei coin già presenti
              </span>
            </span>
          </label>
        </RadioGroup>
      </div>

      {/* Summary dinamico */}
      <div
        className="mt-4 px-3 py-2 rounded-lg text-[11px]"
        style={{
          background: "var(--admin-page-bg)",
          border: "1px solid var(--admin-input-border)",
          color: "var(--admin-text-muted)",
        }}>
        Cliccando <strong style={{ color: "var(--admin-text)" }}>Import</strong>:
        importerai le posizioni{" "}
        <span className="font-mono" style={{ color: "var(--admin-text)" }}>
          #{rangeFrom}-#{rangeTo}
        </span>{" "}
        della classifica globale CoinGecko. I simboli{" "}
        <strong style={{ color: "var(--admin-text)" }}>nuovi</strong> verranno
        inseriti; quelli{" "}
        <strong style={{ color: "var(--admin-text)" }}>già nel registry</strong>{" "}
        {mode === "skip"
          ? "saranno skippati."
          : "saranno aggiornati (nome, market cap, immagine)."}
      </div>

      <div className="mt-4">
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// Maintenance dropdown
// ---------------------------------------------------------------------------

function MaintenanceMenu({
  isBackfilling,
  isRefreshingAll,
  isBackfillingHistory,
  historyDays,
  onHistoryDaysChange,
  onBackfillImages,
  onRefreshMetadata,
  onBackfillHistory,
}: {
  isBackfilling: boolean;
  isRefreshingAll: boolean;
  isBackfillingHistory: boolean;
  historyDays: number;
  onHistoryDaysChange: (n: number) => void;
  onBackfillImages: () => void;
  onRefreshMetadata: () => void;
  onBackfillHistory: () => void;
}) {
  const isAnyRunning = isBackfilling || isRefreshingAll || isBackfillingHistory;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={isAnyRunning}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          style={{
            background: "transparent",
            color: "var(--admin-text-muted)",
            border: "1px solid var(--admin-input-border)",
          }}>
          {isAnyRunning ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Settings2 size={12} />
          )}
          Manutenzione
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-[340px]"
        style={{
          background: "var(--admin-card-bg)",
          border: "1px solid var(--admin-card-border)",
          color: "var(--admin-text)",
        }}>
        <DropdownMenuLabel className="text-[10px] uppercase tracking-wide">
          Azioni bulk
        </DropdownMenuLabel>
        <DropdownMenuItem
          disabled={isBackfilling}
          onSelect={(e) => {
            e.preventDefault();
            onBackfillImages();
          }}
          className="flex-col items-start gap-1 py-2.5">
          <div className="flex items-center gap-2 font-medium">
            {isBackfilling ? <Loader2 size={12} className="animate-spin" /> : <CloudUpload size={12} />}
            Backfill immagini su R2
          </div>
          <div className="text-[11px] opacity-70">
            Quando: attivi R2 per la prima volta. Sposta tutte le icone da
            CoinGecko CDN al tuo bucket R2. Skip coin già su R2.
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={isRefreshingAll}
          onSelect={(e) => {
            e.preventDefault();
            onRefreshMetadata();
          }}
          className="flex-col items-start gap-1 py-2.5">
          <div className="flex items-center gap-2 font-medium">
            {isRefreshingAll ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            Refresh metadata + immagini
          </div>
          <div className="text-[11px] opacity-70">
            Quando: dopo aver cambiato la sorgente immagini (es. su retina/large).
            Re-fetcha da CoinGecko nome, market cap, immagine. ~1.5s per coin.
          </div>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[10px] uppercase tracking-wide">
          Backfill storico (CryptoCompare)
        </DropdownMenuLabel>
        <div className="px-2 pb-2 flex items-center gap-2">
          <label className="text-[11px]" style={{ color: "var(--admin-text-muted)" }}>
            Giorni:
          </label>
          <select
            value={historyDays}
            onChange={(e) => onHistoryDaysChange(Number(e.target.value))}
            disabled={isBackfillingHistory}
            className="flex-1 px-2 py-1 text-xs rounded font-mono disabled:opacity-60"
            style={{
              background: "var(--admin-page-bg)",
              border: "1px solid var(--admin-input-border)",
              color: "var(--admin-text)",
            }}>
            {[30, 90, 180, 365].map((n) => (
              <option key={n} value={n}>
                {n}gg
              </option>
            ))}
          </select>
        </div>
        <DropdownMenuItem
          disabled={isBackfillingHistory}
          onSelect={(e) => {
            e.preventDefault();
            onBackfillHistory();
          }}
          className="flex-col items-start gap-1 py-2.5">
          <div className="flex items-center gap-2 font-medium">
            {isBackfillingHistory ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
            Backfill prezzi storici
          </div>
          <div className="text-[11px] opacity-70">
            Quando: dopo l'attivazione del modulo o se vedi punti arrotondati
            (vecchio path snapshot). Rimpiazza solo i prezzi senza decimali,
            lascia intatti quelli post-fix.
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
