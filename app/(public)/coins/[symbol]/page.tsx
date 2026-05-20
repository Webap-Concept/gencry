import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, BookmarkPlus, MessageCircle, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CoinChartLazy,
  CoinIcon,
  CoinPriceLabel,
  MiniSparkline,
  formatCompactCount,
  mockWatchlistCount,
} from "@/components/modules/coins";
import { PublicAdaptiveShell } from "@/components/layout/PublicAdaptiveShell";
import { getSession } from "@/lib/auth/session";
import { getCoinForCard, getHistorySeries } from "@/lib/modules/prices/queries";
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
  const coin = await getCoinForCard(symbol);
  const tPage = await getTranslations("prices.page");
  if (!coin) return { title: tPage("not_found_title") };

  const pathname = `/coins/${coin.symbol.toLowerCase()}`;
  const priceStr = formatPriceSeo(coin.price);
  const changeStr =
    coin.change24h !== null && Number.isFinite(coin.change24h)
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
  const description = tPage("metadata_description", {
    name: coin.name,
    symbol: coin.symbol,
    price: priceStr,
    change: changeStr,
    rank: rankStr,
  });
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
  const coin = await getCoinForCard(symbol);
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

  const isAuthed = Boolean(session);
  const tCommon = await getTranslations("prices.common");
  const tLabels = await getTranslations("prices.labels");

  return (
    <>
      <CoinJsonLd coin={coin} siteUrl={siteUrl} />
      {isAuthed && (
        <Link
          href="/explore"
          prefetch={false}
          className="inline-flex items-center gap-1.5 text-xs text-gc-fg-3 hover:text-gc-fg-2 transition-colors"
        >
          <ArrowLeft size={14} />
          {tCommon("explore")}
        </Link>
      )}
      <CoinHeader
        coin={coin}
        actions={<HeaderActions isAuthed={isAuthed} />}
        sparklineAriaLabel={tLabels("weekly_chart_aria")}
      />
      <CoinChartLazy symbol={coin.symbol} initialSeries={initialSeries} />
      <StatsGrid coin={coin} />
      {/* Post recenti che menzionano questo coin. Server Component
          riusa la stessa pipeline visibility/block del feed. Anonimi
          vedono solo i public posts, loggati anche i members. */}
      <CoinRelatedPostsSection symbol={coin.symbol} limit={5} />
      {!isAuthed && <AnonymousCta coinName={coin.name} />}
    </>
  );
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function CoinHeader({
  coin,
  actions,
  sparklineAriaLabel,
}: {
  coin: CoinView;
  actions?: React.ReactNode;
  sparklineAriaLabel: string;
}) {
  return (
    <header className="flex items-start gap-4 flex-wrap">
      <CoinIcon
        symbol={coin.symbol}
        name={coin.name}
        imageUrl={coin.imageUrl}
        size="xl"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-2xl font-semibold text-gc-fg">{coin.name}</h1>
          {typeof coin.marketCapRank === "number" && coin.marketCapRank > 0 && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gc-bg-3 border border-gc-line text-gc-fg-2 tabular-nums">
              #{coin.marketCapRank}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gc-fg-3 mt-1">
          <span className="uppercase tracking-wide">{coin.symbol}</span>
          {coin.category && (
            <>
              <span aria-hidden>·</span>
              <span>{coin.category}</span>
            </>
          )}
        </div>
        <div className="mt-4">
          <CoinPriceLabel
            price={coin.price}
            change24h={coin.change24h}
            size="lg"
          />
        </div>
      </div>
      <div className="flex flex-col items-end gap-3">
        {/* Su mobile la sparkline mini comprimerebbe il blocco prezzo
            (lo troncava a "$77,3..."); la nascondiamo perché il chart
            grande sotto la copre comunque. Da sm in su torna utile come
            "preview" del trend settimanale accanto al titolo. */}
        <div className="hidden sm:block">
          <MiniSparkline
            id={coin.symbol}
            points={coin.weeklySparkline}
            width={180}
            height={60}
            ariaLabel={sparklineAriaLabel}
          />
        </div>
        {actions}
      </div>
    </header>
  );
}

async function HeaderActions({ isAuthed }: { isAuthed: boolean }) {
  if (!isAuthed) return null;
  const tCommon = await getTranslations("prices.common");
  // Placeholder finché le feature reali non esistono. Disabled per non
  // fingere interattività; reso visibile per dare anteprima visiva.
  return (
    <div className="flex items-center gap-2">
      <Button type="button" size="sm" variant="outline" disabled>
        <BookmarkPlus size={14} />
        {tCommon("watchlist")}
      </Button>
      <Button type="button" size="sm" variant="ghost" disabled aria-label="Share">
        <Share2 size={14} />
      </Button>
    </div>
  );
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
  const watchlistCount = mockWatchlistCount(coin.symbol);
  const tLabels = await getTranslations("prices.labels");
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
        hint={tLabels("mockup_hint")}
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
    offers: {
      "@type": "Offer",
      priceCurrency: "USD",
      price: coin.price.toString(),
      availability: "https://schema.org/InStock",
      seller: { "@type": "Organization", name: "CoinGecko" },
    },
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
