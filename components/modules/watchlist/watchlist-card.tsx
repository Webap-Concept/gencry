// components/modules/watchlist/watchlist-card.tsx
//
// Card lista watchlist (mio profilo). Riusabile cross-context: lista
// /watchlist, future slot home, eventuali widget. Server Component:
// nessun stato locale, riceve `WatchlistSummary` server-side.
//
// Pattern "stretched link":
//   - 1 solo <Link> assoluto invisibile che copre tutta la card.
//   - I figli decorativi hanno `pointer-events-none` → il click trapassa.
//   - Solo il dropdown actions ha `pointer-events-auto`.
//   In questo modo non ci sono <a> annidati anche se mostriamo CTA
//   visivi (es. "Aggiungi la prima coin").
//
// Card vuota (coinsCount === 0): il link punta a /watchlist/<id>?add=1
// che fa auto-aprire la modale "Aggiungi coin" sul detail. Niente
// blocco perf vuoto: lo sostituisco con un CTA visivo per dare un
// gesto chiaro ("cosa devo fare?").
import Link from "next/link";
import { Globe, Lock, Plus } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { WatchlistSummary } from "@/lib/modules/watchlist/types";
import { CoinIcon } from "@/components/modules/coins/coin-icon";
import { cn } from "@/lib/utils";

type Props = {
  watchlist: WatchlistSummary;
  /** Slot client per dropdown menu actions. Quando absent, la card
   *  e' read-only (vista pubblica /w/<u>/<slug>). */
  actions?: React.ReactNode;
  /** Locale-aware "aggiornata X" — calcolato dal parent server per
   *  evitare di passare Date al client. */
  updatedAtLabel?: string;
};

export async function WatchlistCard({ watchlist, actions, updatedAtLabel }: Props) {
  const t = await getTranslations("watchlist.card");
  const isEmpty = watchlist.coinsCount === 0;
  const detailHref = `/watchlist/${watchlist.id}`;
  const linkHref = isEmpty ? `${detailHref}?add=1` : detailHref;

  return (
    <article className="relative bg-gc-bg-2 border border-gc-line rounded-2xl p-4 flex flex-col gap-4 hover:bg-gc-bg-3 transition-colors">
      {/* Stretched link — copre tutta la card. Children pointer-events-none
          per lasciar trapassare il click; eccezioni hanno pointer-events-auto. */}
      <Link
        href={linkHref}
        prefetch={false}
        aria-label={watchlist.name}
        className="absolute inset-0 rounded-2xl z-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-gc-accent"
      />

      {/* Header: title + visibility badge + actions slot */}
      <header className="relative z-10 pointer-events-none flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-gc-fg truncate leading-tight">
            {watchlist.name}
          </h3>
          <div className="flex items-center gap-1.5 mt-1">
            <VisibilityBadge visibility={watchlist.visibility} t={t} />
            {watchlist.description ? (
              <span className="text-xs text-gc-fg-3 truncate">
                · {watchlist.description}
              </span>
            ) : null}
          </div>
        </div>
        {actions ? (
          <div className="shrink-0 pointer-events-auto">{actions}</div>
        ) : null}
      </header>

      {/* Body: empty CTA oppure perf + preview */}
      {isEmpty ? (
        <EmptyCta label={t("empty_card_cta")} />
      ) : (
        <div className="relative z-10 pointer-events-none flex items-end justify-between gap-3">
          <Perf30dLabel
            value={watchlist.perf30dPct}
            label={t("perf_30d_label")}
            fallback={t("perf_unavailable")}
          />
          <CoinsPreview coins={watchlist.topCoins} emptyLabel={t("no_coins")} />
        </div>
      )}

      {/* Footer compatto: N coin · aggiornata X. Nascosto su empty (la
          riga sotto e' ridondante col CTA). */}
      {!isEmpty ? (
        <footer className="relative z-10 pointer-events-none flex items-center justify-between text-[11px] text-gc-fg-3 border-t border-gc-line pt-3">
          <span>{t("coins_count", { count: watchlist.coinsCount })}</span>
          {updatedAtLabel ? <span>{updatedAtLabel}</span> : null}
        </footer>
      ) : null}
    </article>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────

function VisibilityBadge({
  visibility,
  t,
}: {
  visibility: "private" | "public";
  t: Awaited<ReturnType<typeof getTranslations<"watchlist.card">>>;
}) {
  const Icon = visibility === "public" ? Globe : Lock;
  const label = visibility === "public" ? t("visibility_public") : t("visibility_private");
  return (
    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-gc-fg-3">
      <Icon size={11} strokeWidth={2} aria-hidden />
      {label}
    </span>
  );
}

function EmptyCta({ label }: { label: string }) {
  // Decorativo: lo stretched-link parent intercetta il click sull'intera
  // card e naviga a /watchlist/<id>?add=1 che apre auto la modale add.
  return (
    <div className="relative z-10 pointer-events-none flex flex-col items-center justify-center gap-2 py-6 rounded-xl border border-dashed border-gc-line bg-gc-bg/40">
      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gc-accent/15 text-gc-accent">
        <Plus size={16} strokeWidth={2.5} aria-hidden />
      </span>
      <span className="text-sm font-medium text-gc-fg">{label}</span>
    </div>
  );
}

function Perf30dLabel({
  value,
  label,
  fallback,
}: {
  value: number | null;
  label: string;
  fallback: string;
}) {
  if (value === null || !Number.isFinite(value)) {
    return (
      <div className="min-w-0">
        <p className="text-2xl font-serif text-gc-fg-3 tabular-nums leading-none">{fallback}</p>
        <p className="text-[10px] uppercase tracking-wide text-gc-fg-3 mt-1">{label}</p>
      </div>
    );
  }
  const tone =
    value > 0 ? "text-gc-pos" : value < 0 ? "text-gc-neg" : "text-gc-fg-3";
  const sign = value > 0 ? "+" : "";
  return (
    <div className="min-w-0">
      <p
        className={cn(
          "text-2xl font-serif tabular-nums leading-none",
          tone,
        )}
      >
        {sign}
        {value.toFixed(1)}%
      </p>
      <p className="text-[10px] uppercase tracking-wide text-gc-fg-3 mt-1">{label}</p>
    </div>
  );
}

function CoinsPreview({
  coins,
  emptyLabel,
}: {
  coins: { symbol: string; name: string; imageUrl: string | null }[];
  emptyLabel: string;
}) {
  if (coins.length === 0) {
    return <span className="text-xs text-gc-fg-3">{emptyLabel}</span>;
  }
  return (
    <ul className="flex -space-x-2" aria-label="Coins">
      {coins.map((c) => (
        <li key={c.symbol} className="ring-2 ring-gc-bg-2 rounded-full">
          <CoinIcon
            symbol={c.symbol}
            name={c.name}
            imageUrl={c.imageUrl}
            size="sm"
          />
        </li>
      ))}
    </ul>
  );
}
