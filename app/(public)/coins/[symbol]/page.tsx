import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

// ISR (PR3 refactor Redis-first): la coin page e' pubblica e martellata da
// bot/anon. Vercel edge CDN serve la stessa risposta cached per 60s; al
// cache miss 1 sola request raggiunge il backend. Risultato: 10k visit/min
// su /coins/btc → 1 req/min al backend invece di 10k.
//
// Staleness max: 60s (ISR) + ~120s (Upstash TTL legato a cron 1-min) =
// ~3 min nel peggior caso. Per un crypto-social acceptable; per HFT
// servirebbe WebSocket layer, V2.
export const revalidate = 60;
import {
  CoinChartLazy,
  CoinIcon,
  CoinPriceLabel,
  MiniSparkline,
  formatCompactCount,
} from "@/components/modules/coins";
import { AddToWatchlistButton } from "@/components/modules/watchlist/add-to-watchlist-button";
import { PublicAdaptiveShell } from "@/components/layout/PublicAdaptiveShell";
import { getSession } from "@/lib/auth/session";
import { getCoinDetail, getHistorySeries } from "@/lib/modules/prices/queries";
import { getWatchlistCountForSymbol } from "@/lib/modules/watchlist/queries";
import type { CoinView } from "@/lib/modules/prices/queries";
import { generatePageMetadata, getSiteUrl } from "@/lib/seo";
import { CoinRelatedPostsSection } from "@/components/modules/posts/CoinRelatedPostsSection";
import type { Metadata } from "next";

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

/**
 * Riusa `generatePageMetadata` come tutte le pagine CMS pubbliche: l'admin
 * può overridare title/description/og/robots per uno specifico coin
 * inserendo una riga in `seo_pages` con pathname `/coins/btc` ecc. Senza
 * override, usiamo i defaults dinamici qui sotto (nome + prezzo live +
 * rank), così ogni coin ha già metadata utili out of the box.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ symbol: string }>;
}): Promise<Metadata> {
  const { symbol } = await params;
  const coin = await getCoinDetail(symbol);
  const tPage = await getTranslations("prices.page");
  if (!coin) return { title: tPage("not_found_title") };

  const pathname = `/coins/${coin.symbol.toLowerCase()}`;
  const changeStr =
    coin.priceAvailable && coin.change24h !== null && Number.isFinite(coin.change24h)
      ? tPage("metadata_change_24h", {
          change: `${coin.change24h > 0 ? "+" : ""}${coin.change24h.toFixed(2)}%`,
        })
      : "";
  const rankStr =
    typeof coin.marketCapRank === "number" && coin.marketCapRank > 0
      ? tPage("metadata_rank", { rank: coin.marketCapRank })
      : "";

  const title = `${coin.name} (${coin.symbol}) — ${tPage("metadata_title_suffix")}`;
  // SERP: prezzo dinamico (CTR migliore, Google ricrawla periodicamente).
  // Se la quote live manca (priceAvailable=false) NON mettiamo "$0" nella
  // description: usiamo la versione statica nome+symbol così il SERP resta
  // sensato e la pagina indicizza comunque.
  const description = coin.priceAvailable
    ? tPage("metadata_description", {
        name: coin.name,
        symbol: coin.symbol,
        price: formatPriceSeo(coin.price),
        change: changeStr,
        rank: rankStr,
      })
    : tPage("og_description", { name: coin.name, symbol: coin.symbol });
  // OG/Twitter: statica per evitare card "stale" cachate da Twitter/FB
  // quando il prezzo è cambiato (lo share continuerebbe a mostrare il
  // vecchio valore per giorni/settimane).
  const ogDescription = tPage("og_description", {
    name: coin.name,
    symbol: coin.symbol,
  });

  // NB: non passiamo `image` qui → lasciamo che Next colleghi
  // automaticamente l'OG image dinamica generata da
  // `opengraph-image.tsx` (card 1200x630 con prezzo, sparkline, logo,
  // claim). Passare un'image custom sovrascriverebbe quella card con
  // la sola icona R2 quadrata, sprecando il lavoro fatto.
  return generatePageMetadata(pathname, {
    title,
    description,
    ogDescription,
  });
}

function formatPriceSeo(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "$0";
  const abs = Math.abs(value);
  if (abs < 0.01) return `$${value.toPrecision(4)}`;
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function CoinDetailPage({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  // `notFound()` viene chiamato PRIMA di renderizzare lo shell: in
  // questo modo l'unwind del `NEXT_NOT_FOUND` esce dalla page senza
  // toccare `<PublicAdaptiveShell>` e raggiunge il root
  // `app/not-found.tsx` (wrappato dal solo root layout) → 404
  // full-page sia per loggati che per anonimi.
  const { symbol } = await params;
  const coin = await getCoinDetail(symbol);
  if (!coin) notFound();

  return (
    <PublicAdaptiveShell>
      <div className="space-y-6 max-w-4xl">
        <Suspense fallback={<CoinDetailSkeleton />}>
          <CoinDetailBody coin={coin} />
        </Suspense>
      </div>
    </PublicAdaptiveShell>
  );
}

async function CoinDetailBody({ coin }: { coin: CoinView }) {
  const [session, initialSeries, siteUrl] = await Promise.all([
    getSession(),
    // SSR del range default "1w" — il client può switchare a 1d/1m/1y
    // chiamando l'endpoint /api/modules/prices/<symbol>/history.
    getHistorySeries(coin.symbol, "1w"),
    getSiteUrl(),
  ]);

  const isLoggedIn = Boolean(session);
  const tCommon = await getTranslations("prices.common");
  const tLabels = await getTranslations("prices.labels");
  const tPage = await getTranslations("prices.page");

  const backLink = (
    <Link
      href="/explore"
      prefetch={false}
      className="inline-flex items-center gap-1.5 text-xs text-gc-fg-3 hover:text-gc-fg-2 transition-colors"
    >
      <ArrowLeft size={14} />
      {tCommon("explore")}
    </Link>
  );

  return (
    <>
      <CoinJsonLd coin={coin} siteUrl={siteUrl} />

      {/* Mobile: back + watchlist sulla STESSA riga (compatto, niente
          due righe impilate). Se anon, il back manca → lo span vuoto
          tiene il watchlist a destra. */}
      <div className="flex items-center justify-between gap-2 sm:hidden">
        {isLoggedIn ? backLink : <span aria-hidden />}
        <AddToWatchlistButton symbol={coin.symbol} isLoggedIn={isLoggedIn} compact />
      </div>

      {/* Desktop: back come riga sopra l'header (il watchlist sta nel
          blocco header a destra). */}
      {isLoggedIn ? <div className="hidden sm:block">{backLink}</div> : null}

      <CoinHeader
        coin={coin}
        actions={
          <HeaderActions isLoggedIn={isLoggedIn} symbol={coin.symbol} />
        }
        sparklineAriaLabel={tLabels("weekly_chart_aria")}
      />
      {coin.priceAvailable ? (
        <CoinChartLazy symbol={coin.symbol} initialSeries={initialSeries} />
      ) : (
        <div className="rounded-2xl bg-gc-bg-2 border border-dashed border-gc-line aspect-[16/7] flex items-center justify-center">
          <p className="text-sm text-gc-fg-3">{tPage("price_unavailable")}</p>
        </div>
      )}
      <StatsGrid coin={coin} />
      {/* Post recenti che menzionano questo coin. Server Component
          riusa la stessa pipeline visibility/block del feed. Anonimi
          vedono solo i public posts, loggati anche i members. */}
      <CoinRelatedPostsSection symbol={coin.symbol} limit={5} />
      {!isLoggedIn && <AnonymousCta coinName={coin.name} />}
    </>
  );
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

async function CoinHeader({
  coin,
  actions,
  sparklineAriaLabel,
}: {
  coin: CoinView;
  actions?: React.ReactNode;
  sparklineAriaLabel: string;
}) {
  const tLabels = await getTranslations("prices.labels");
  const tPage = await getTranslations("prices.page");
  const hasRank =
    typeof coin.marketCapRank === "number" && coin.marketCapRank > 0;
  // Mobile (centrato, alla profilo): icona grande, nome, ticker·category
  // menta-in-dark, riga prezzo|24h|rank con divisori. Desktop (sm+):
  // layout orizzontale classico (prezzo grande + sparkline a dx).
  return (
    <header>
      {/* Le actions mobile (bottone watchlist) vivono nella riga
          back+watchlist del CoinDetailBody. Qui `actions` e' montato solo
          nel blocco desktop a destra. */}
      <div className="flex flex-col items-center text-center sm:flex-row sm:items-start sm:text-left gap-3 sm:gap-4">
        <CoinIcon
          symbol={coin.symbol}
          name={coin.name}
          imageUrl={coin.imageUrl}
          size="xl"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
            <h1 className="text-2xl font-semibold text-gc-fg">{coin.name}</h1>
            {hasRank && (
              <span className="hidden sm:inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gc-bg-3 border border-gc-line text-gc-fg-2 tabular-nums">
                #{coin.marketCapRank}
              </span>
            )}
          </div>
          {/* ticker · category — verde menta in dark (classe coin-meta) */}
          <div className="coin-meta flex items-center justify-center sm:justify-start gap-1.5 text-xs text-gc-fg-3 mt-1">
            <span className="uppercase tracking-wide">{coin.symbol}</span>
            {coin.category && (
              <>
                <span aria-hidden>·</span>
                <span>{coin.category}</span>
              </>
            )}
          </div>
          {/* Prezzo grande: solo desktop. Su mobile vive nella riga valori.
              Se la quote live manca, mostriamo una nota muted invece del
              prezzo (la pagina resta valida, niente 404). */}
          <div className="hidden sm:block mt-4">
            {coin.priceAvailable ? (
              <CoinPriceLabel
                price={coin.price}
                change24h={coin.change24h}
                size="lg"
              />
            ) : (
              <p className="text-sm text-gc-fg-3">{tPage("price_unavailable")}</p>
            )}
          </div>
        </div>
        {/* Desktop: sparkline + actions a destra. */}
        <div className="hidden sm:flex flex-col items-end gap-3">
          <MiniSparkline
            id={coin.symbol}
            points={coin.weeklySparkline}
            width={180}
            height={60}
            ariaLabel={sparklineAriaLabel}
          />
          {actions}
        </div>
      </div>

      {/* Mobile: riga valori distribuiti con divisori — prezzo | 24h | rank. */}
      <div className="sm:hidden mt-4 flex justify-center divide-x divide-gc-line border-t border-gc-line pt-4">
        <ValueCell
          label={tLabels("price")}
          value={coin.priceAvailable ? fmtCoinPrice(coin.price) : "—"}
        />
        <ValueCell
          label="24h"
          value={coin.priceAvailable ? fmtCoinChange(coin.change24h) : "—"}
          tone={changeTone(coin.priceAvailable ? coin.change24h : null)}
        />
        {hasRank ? (
          <ValueCell label={tLabels("rank")} value={`#${coin.marketCapRank}`} />
        ) : null}
      </div>
    </header>
  );
}

function HeaderActions({
  isLoggedIn,
  symbol,
}: {
  isLoggedIn: boolean;
  symbol: string;
}) {
  // Solo bottone watchlist compatto (icona + "Watchlist"). Lo Share e'
  // stato rimosso (feature non prevista). Anon → "Watchlist" link sign-in.
  return (
    <AddToWatchlistButton symbol={symbol} isLoggedIn={isLoggedIn} compact />
  );
}

// Cella della riga valori mobile (prezzo | 24h | rank).
function ValueCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="text-center px-5">
      <p className={`text-lg font-semibold tabular-nums leading-tight ${tone ?? "text-gc-fg"}`}>
        {value}
      </p>
      <p className="text-[10px] uppercase tracking-wide text-gc-fg-3 mt-0.5">
        {label}
      </p>
    </div>
  );
}

function changeTone(change: number | null): string {
  if (change === null || !Number.isFinite(change)) return "text-gc-fg-3";
  if (change > 0) return "text-gc-pos";
  if (change < 0) return "text-gc-neg";
  return "text-gc-fg-3";
}

function fmtCoinPrice(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "$0.00";
  const abs = Math.abs(value);
  if (abs < 0.01) return `$${value.toPrecision(4)}`;
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmtCoinChange(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

async function AnonymousCta({ coinName }: { coinName: string }) {
  const tCommon = await getTranslations("prices.common");
  const tPage = await getTranslations("prices.page");
  return (
    <section className="rounded-2xl p-5 bg-gc-bg-2 border border-gc-line flex flex-col sm:flex-row sm:items-center gap-4">
      <div className="flex-1 min-w-0">
        <h2 className="text-base font-semibold text-gc-fg">
          {tPage("cta_follow_title", { name: coinName })}
        </h2>
        <p className="text-xs text-gc-fg-3 mt-1">
          {tPage("cta_follow_description", { name: coinName })}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button asChild variant="ghost" size="sm">
          <Link href="/sign-in" prefetch={false}>
            {tCommon("sign_in")}
          </Link>
        </Button>
        <Button asChild size="sm">
          <Link href="/sign-up" prefetch={false}>
            <MessageCircle size={14} />
            {tCommon("sign_up")}
          </Link>
        </Button>
      </div>
    </section>
  );
}

async function StatsGrid({ coin }: { coin: CoinView }) {
  const [watchlistCount, tLabels] = await Promise.all([
    getWatchlistCountForSymbol(coin.symbol),
    getTranslations("prices.labels"),
  ]);
  return (
    <section className="grid gap-3 grid-cols-2 sm:grid-cols-4">
      <Stat
        label={tLabels("market_cap")}
        value={coin.marketCap !== null ? formatCompactCurrency(coin.marketCap) : "—"}
      />
      <Stat
        label={tLabels("volume_24h")}
        value={coin.volume24h !== null ? formatCompactCurrency(coin.volume24h) : "—"}
      />
      <Stat
        label={tLabels("rank")}
        value={
          typeof coin.marketCapRank === "number" && coin.marketCapRank > 0
            ? `#${coin.marketCapRank}`
            : "—"
        }
      />
      <Stat
        label={tLabels("in_watchlist")}
        value={formatCompactCount(watchlistCount)}
      />
    </section>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl p-3 bg-gc-bg-2 border border-gc-line">
      <div className="text-[11px] uppercase tracking-wide text-gc-fg-3">
        {label}
        {hint && (
          <span className="ml-1 normal-case tracking-normal text-gc-fg-3/70">
            ({hint})
          </span>
        )}
      </div>
      <div className="text-sm font-semibold text-gc-fg mt-1 tabular-nums">
        {value}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCompactCurrency(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "—";
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(2)}K`;
  return `$${value.toFixed(0)}`;
}

// ---------------------------------------------------------------------------
// JSON-LD
// ---------------------------------------------------------------------------

/**
 * Structured data per la coin page. Type `FinancialProduct` di schema.org
 * (Google riconosce, anche se non c'è un type "Cryptocurrency" canonico).
 * Pure server component: emette UN <script type="application/ld+json">
 * con prezzo live al render. Niente import client.
 */
function CoinJsonLd({ coin, siteUrl }: { coin: CoinView; siteUrl: string }) {
  const url = siteUrl
    ? `${siteUrl}/coins/${coin.symbol.toLowerCase()}`
    : undefined;

  const financialProduct: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "FinancialProduct",
    name: coin.name,
    alternateName: coin.symbol,
    category: "Cryptocurrency",
    ...(coin.imageUrl ? { image: coin.imageUrl } : {}),
    ...(url ? { url } : {}),
    // Offer solo se abbiamo un prezzo live: niente offerta a "$0" che
    // confonderebbe i rich snippet quando la quote manca.
    ...(coin.priceAvailable
      ? {
          offers: {
            "@type": "Offer",
            priceCurrency: "USD",
            price: coin.price.toString(),
            availability: "https://schema.org/InStock",
            seller: { "@type": "Organization", name: "CoinGecko" },
          },
        }
      : {}),
  };

  // BreadcrumbList: rich snippet "Home › Coins › Bitcoin" sui SERP
  // Google. Niente effetto se siteUrl è vuoto (nessun item ha URL).
  const breadcrumbs: Record<string, unknown> | null = siteUrl
    ? {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Home",
            item: siteUrl,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "Coins",
            item: `${siteUrl}/coins`,
          },
          {
            "@type": "ListItem",
            position: 3,
            name: `${coin.name} (${coin.symbol})`,
            item: url,
          },
        ],
      }
    : null;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(financialProduct),
        }}
      />
      {breadcrumbs && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function CoinDetailSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" aria-hidden>
      <div className="flex items-start gap-4 flex-wrap">
        <div className="w-14 h-14 rounded-full bg-gc-bg-3" />
        <div className="flex-1 min-w-0 space-y-2">
          <div className="h-6 w-40 rounded bg-gc-bg-3" />
          <div className="h-3 w-24 rounded bg-gc-bg-3" />
          <div className="h-8 w-32 rounded bg-gc-bg-3 mt-4" />
        </div>
        <div className="hidden sm:block w-[180px] h-[60px] rounded bg-gc-bg-3" />
      </div>
      <div className="rounded-2xl bg-gc-bg-2 border border-dashed border-gc-line aspect-[16/7]" />
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl p-3 bg-gc-bg-2 border border-gc-line space-y-2"
          >
            <div className="h-2 w-16 rounded bg-gc-bg-3" />
            <div className="h-4 w-20 rounded bg-gc-bg-3" />
          </div>
        ))}
      </div>
    </div>
  );
}
