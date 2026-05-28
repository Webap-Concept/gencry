"use client";
// Dialog "Aggiungi coin". Debounced search server-side via
// `searchTrackedCoinsAction`. Lista risultati cliccabili: 1 click =
// add immediato (no conferma intermedia — il dialog resta aperto cosi'
// l'utente puo' aggiungere piu' coin in sequenza).

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Bookmark, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  GcModal,
  GcModalContent,
  GcModalClose,
} from "@/components/ui/gc-modal";
import { CoinIcon } from "@/components/modules/coins/coin-icon";
import { CoinPriceLabel } from "@/components/modules/coins/coin-price-label";
import { addCoinAction } from "@/lib/modules/watchlist/actions";
import {
  searchTrackedCoinsAction,
  type CoinSearchResult,
} from "@/lib/modules/watchlist/coin-search";

const DEBOUNCE_MS = 220;

type Props = {
  watchlistId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function AddCoinDialog({ watchlistId, open, onOpenChange }: Props) {
  const t = useTranslations("watchlist.add_coin");
  const tErr = useTranslations("watchlist.errors");
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CoinSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recentAdded, setRecentAdded] = useState<Set<string>>(new Set());
  const [_, startTransition] = useTransition();

  // Debounce: ad ogni cambio query lancia un timer; cancellato al
  // prossimo input. Quando il dialog chiude, reset stato.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setError(null);
      setRecentAdded(new Set());
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    if (query.trim().length === 0) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    timerRef.current = setTimeout(async () => {
      const rows = await searchTrackedCoinsAction(query);
      setResults(rows);
      setSearching(false);
    }, DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query, open]);

  const onPickCoin = (symbol: string) => {
    setError(null);
    setAdding(symbol);
    startTransition(async () => {
      const res = await addCoinAction(watchlistId, symbol);
      setAdding(null);
      if (!res.ok) {
        setError(formatErr(res, tErr));
        return;
      }
      setRecentAdded((prev) => {
        const next = new Set(prev);
        next.add(symbol);
        return next;
      });
      router.refresh();
    });
  };

  return (
    <GcModal open={open} onOpenChange={onOpenChange}>
      <GcModalContent
        icon={Bookmark}
        title={t("title")}
        description={t("description")}
        size="md"
        footer={
          <GcModalClose asChild>
            <Button type="button" variant="ghost" size="sm">
              {t("close")}
            </Button>
          </GcModalClose>
        }
      >
        <div className="space-y-4">
          <div className="relative">
            <Search
              size={14}
              aria-hidden
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gc-fg-3"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("search_placeholder")}
              aria-label={t("search_label")}
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-gc-line bg-gc-bg text-sm text-gc-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-gc-accent"
              autoFocus
            />
          </div>

          {query.trim().length > 0 && !searching && results.length === 0 ? (
            <p className="text-sm text-gc-fg-3 text-center py-4">
              {t("no_results")}
            </p>
          ) : null}

          {results.length > 0 ? (
            <ul className="divide-y divide-gc-line max-h-72 overflow-auto rounded-lg border border-gc-line">
              {results.map((r) => {
                const isAdded = recentAdded.has(r.symbol);
                const isAdding = adding === r.symbol;
                return (
                  <li
                    key={r.symbol}
                    className="flex items-center gap-3 px-3 py-2"
                  >
                    <CoinIcon
                      symbol={r.symbol}
                      name={r.name}
                      imageUrl={r.imageUrl}
                      size="md"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gc-fg truncate">
                        {r.name}
                      </p>
                      <p className="text-[11px] uppercase tracking-wide text-gc-fg-3">
                        {r.symbol}
                      </p>
                    </div>
                    {r.price !== null ? (
                      <CoinPriceLabel
                        price={r.price}
                        change24h={r.change24h}
                        size="sm"
                        className="text-right shrink-0 hidden sm:flex"
                      />
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      variant={isAdded ? "ghost" : "default"}
                      onClick={() => onPickCoin(r.symbol)}
                      disabled={isAdding || isAdded}
                    >
                      <Plus size={12} aria-hidden />
                      {isAdded ? "✓" : t("add_button")}
                    </Button>
                  </li>
                );
              })}
            </ul>
          ) : null}

          {error ? (
            <p className="text-xs text-gc-danger" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </GcModalContent>
    </GcModal>
  );
}

function formatErr(
  res: { error: string; cap?: number; retryAfter?: number },
  tErr: ReturnType<typeof useTranslations<"watchlist.errors">>,
): string {
  if (res.error === "coins_cap_reached") {
    return tErr("watchlist_coins_cap_reached", { cap: res.cap ?? 50 });
  }
  if (res.error === "coin_already_added") {
    return tErr("coin_already_added", { symbol: "" });
  }
  if (res.error === "coin_not_supported") {
    return tErr("coin_not_supported", { symbol: "" });
  }
  if (res.error === "rate_limited") {
    return tErr("rate_limited", { seconds: res.retryAfter ?? 60 });
  }
  try {
    return tErr(
      res.error as
        | "not_found"
        | "forbidden"
        | "validation"
        | "generic",
    );
  } catch {
    return tErr("generic");
  }
}
