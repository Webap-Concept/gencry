"use client";
// components/modules/watchlist/add-to-watchlist-button.tsx
//
// Bottone "Aggiungi a watchlist" per la coin page (e ovunque serva).
// La coin page e' ISR-cached → la membership per-utente NON puo' essere
// server-rendered. Quindi:
//   - anon → Link a /sign-in
//   - loggato → DropdownMenu che AL PRIMO OPEN fetcha le mie watchlist +
//     flag membership via loadMyWatchlistsForSymbolAction. Ogni voce e'
//     un CheckboxItem: toggle add/remove ottimistico (il menu resta
//     aperto, onSelect preventDefault). Footer: link "Crea watchlist".
//
// Stato visivo del trigger: se la coin e' in >=1 mia watchlist → variant
// "secondary" (verde, salvata); altrimenti "outline" (neutro, da salvare).

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Plus, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  addCoinAction,
  removeCoinAction,
  loadMyWatchlistsForSymbolAction,
} from "@/lib/modules/watchlist/actions";
import type { WatchlistMembershipRow } from "@/lib/modules/watchlist/queries";

type Props = {
  symbol: string;
  isLoggedIn: boolean;
  /** Se conosciuto server-side (es. non lo e' sulla coin page ISR), può
   *  pre-impostare lo stato "salvata". Default false. */
  initialSaved?: boolean;
  size?: "sm" | "default";
  /** Label corta: "Watchlist" invece di "Aggiungi a watchlist". Per
   *  header compatti (coin page). */
  compact?: boolean;
};

export function AddToWatchlistButton({
  symbol,
  isLoggedIn,
  initialSaved = false,
  size = "sm",
}: Props) {
  const t = useTranslations("watchlist.coin_button");
  const [rows, setRows] = useState<WatchlistMembershipRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Fetch della membership AL MOUNT (non solo all'apertura del dropdown):
  // la coin page e' ISR-cached, quindi lo stato salvato/non-salvato non
  // puo' essere server-rendered. Senza questo, il trigger mostrava sempre
  // "+ Watchlist" dopo un refresh anche se la coin era gia' salvata.
  useEffect(() => {
    if (!isLoggedIn) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const res = await loadMyWatchlistsForSymbolAction(symbol);
      if (cancelled) return;
      setRows(res.ok ? res.watchlists : []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, symbol]);

  // "salvata" = almeno una mia watchlist contiene la coin. Prima del
  // fetch usa initialSaved; dopo, deriva da rows.
  const anySaved = rows ? rows.some((r) => r.hasCoin) : initialSaved;

  if (!isLoggedIn) {
    return (
      <Button asChild size={size} variant="secondary" aria-label={t("add")}>
        <Link href="/sign-in" prefetch={false}>
          <Plus size={16} aria-hidden />
        </Link>
      </Button>
    );
  }

  const toggle = (row: WatchlistMembershipRow) => {
    setPendingId(row.id);
    // Optimistic flip locale.
    setRows((prev) =>
      prev
        ? prev.map((r) =>
            r.id === row.id ? { ...r, hasCoin: !r.hasCoin } : r,
          )
        : prev,
    );
    startTransition(async () => {
      const res = row.hasCoin
        ? await removeCoinAction(row.id, symbol)
        : await addCoinAction(row.id, symbol);
      setPendingId(null);
      if (!res.ok) {
        // Rollback su errore.
        setRows((prev) =>
          prev
            ? prev.map((r) =>
                r.id === row.id ? { ...r, hasCoin: row.hasCoin } : r,
              )
            : prev,
        );
      }
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/* Solo-icona: + (da salvare) / ✓ (salvata). Sempre verde menta
            (secondary). aria-label per l'accessibilità (niente testo). */}
        <Button
          type="button"
          size={size}
          variant="secondary"
          aria-label={anySaved ? t("saved") : t("add")}
        >
          {anySaved ? (
            <Check size={16} aria-hidden />
          ) : (
            <Plus size={16} aria-hidden />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuLabel>{t("menu_label")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {loading ? (
          <div className="px-2 py-3 space-y-2" aria-hidden>
            {[0, 1].map((i) => (
              <div key={i} className="h-5 rounded bg-gc-bg-3 animate-pulse" />
            ))}
          </div>
        ) : rows && rows.length > 0 ? (
          rows.map((r) => (
            <DropdownMenuCheckboxItem
              key={r.id}
              checked={r.hasCoin}
              disabled={pendingId === r.id}
              onSelect={(e) => {
                // Resta aperto per toggle multipli.
                e.preventDefault();
                toggle(r);
              }}
            >
              <span className="truncate">{r.name}</span>
            </DropdownMenuCheckboxItem>
          ))
        ) : rows ? (
          <p className="px-2 py-2 text-xs text-gc-fg-3">{t("empty")}</p>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/watchlist" prefetch={false}>
            <Plus size={14} aria-hidden />
            {t("create_new")}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
