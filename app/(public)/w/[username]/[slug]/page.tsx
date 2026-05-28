// app/(public)/w/[username]/[slug]/page.tsx
//
// Vista pubblica di una watchlist. SEO-friendly: aperta a tutti
// (anche anon), JSON-LD ItemList + Breadcrumb, generateMetadata
// dinamica con title+description costruiti dal name+username+coinsCount.
//
// Read-only: nessun add/remove/edit lato visitor. Se viewer == owner,
// mostriamo un bottone "Modifica" che porta a /watchlist/<id> (edit
// view). Stesso pattern di /coins/<symbol>: notFound() PRIMA dello
// shell per 404 full-page senza chrome.
//
// ISR 60s: la watchlist cambia poco e i bot/anon possono scatenare
// traffico. 60s edge + 5min Redis perf cache = max ~6min staleness,
// accettabile.
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, Globe, Pencil } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { PublicAdaptiveShell } from "@/components/layout/PublicAdaptiveShell";
import { CoinIcon } from "@/components/modules/coins/coin-icon";
import { CoinPriceLabel } from "@/components/modules/coins/coin-price-label";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth/session";
import { getPublicWatchlistByUserSlug } from "@/lib/modules/watchlist/queries";
import { generatePageMetadata, getSiteUrl } from "@/lib/seo";
import { WatchlistDetailSkeleton } from "../../../../(protected)/watchlist/[id]/_components/watchlist-detail-skeleton";

export const revalidate = 60;

// ─── Metadata ──────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string; slug: string }>;
}): Promise<Metadata> {
  const { username, slug } = await params;
  const wl = await getPublicWatchlistByUserSlug(username, slug);
  if (!wl) return { title: "Watchlist" };
  const t = await getTranslations("watchlist.public_page");
  const pathname = `/w/${username}/${slug}`;
  const title = t("title_format", { name: wl.name, username });
  const description = wl.description?.trim()
    ? wl.description.slice(0, 160)
    : t("description_format", { username, count: wl.coinsCount });
  return generatePageMetadata(pathname, { title, description });
}

// ─── Page ──────────────────────────────────────────────────────────────

export default async function PublicWatchlistPage({
  params,
}: {
  params: Promise<{ username: string; slug: string }>;
}) {
  const { username, slug } = await params;
  const wl = await getPublicWatchlistByUserSlug(username, slug);
  if (!wl) notFound();

  return (
    <PublicAdaptiveShell>
      <div className="space-y-6 max-w-3xl">
        <Suspense fallback={<WatchlistDetailSkeleton />}>
          <PublicWatchlistBody username={username} slug={slug} />
        </Suspense>
      </div>
    </PublicAdaptiveShell>
  );
}

async function PublicWatchlistBody({
  username,
  slug,
}: {
  username: string;
  slug: string;
}) {
  // Refetch dentro Suspense → la generateMetadata sopra ha gia' fatto un
  // hit cached da unstable_cache; questo e' il secondo round con la data
  // fresca per il render. Non e' duplicato dispendioso: getCoinForCard
  // resta nel pool top200 cached.
  const [wl, session, siteUrl, t] = await Promise.all([
    getPublicWatchlistByUserSlug(username, slug),
    getSession(),
    getSiteUrl(),
    getTranslations("watchlist.public_page"),
  ]);
  if (!wl) notFound();

  const viewerUserId = session?.user.id ?? null;
  const isOwner = viewerUserId === wl.userId;
  const isLoggedIn = Boolean(session);

  return (
    <>
      <WatchlistJsonLd
        wl={wl}
        username={username}
        slug={slug}
        siteUrl={siteUrl}
      />
      {isLoggedIn ? (
        <Link
          href={`/u/${username}`}
          prefetch={false}
          className="inline-flex items-center gap-1.5 text-xs text-gc-fg-3 hover:text-gc-fg-2 transition-colors"
        >
          <ArrowLeft size={14} aria-hidden />
          {t("back_to_profile")}
        </Link>
      ) : null}

      <header className="bg-gc-bg-2 border border-gc-line rounded-2xl p-5">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-serif text-gc-fg leading-tight">
                {wl.name}
              </h1>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] uppercase tracking-wide rounded-full bg-gc-bg-3 text-gc-fg-2 shrink-0">
                <Globe size={11} strokeWidth={2} aria-hidden />
                Public
              </span>
            </div>
            <p className="text-xs text-gc-fg-3 mt-1">
              {isOwner ? (
                t("owned_by_you")
              ) : (
                <Link
                  href={`/u/${username}`}
                  prefetch={false}
                  className="hover:underline decoration-gc-line underline-offset-4"
                >
                  {t("owned_by", { username })}
                </Link>
              )}
            </p>
            {wl.description ? (
              <p className="text-sm text-gc-fg-2 mt-3 whitespace-pre-wrap">
                {wl.description}
              </p>
            ) : null}
          </div>
          {isOwner ? (
            <div className="shrink-0">
              <Button asChild size="sm" variant="outline">
                <Link href={`/watchlist/${wl.id}`} prefetch={false}>
                  <Pencil size={14} aria-hidden />
                  {t("edit_button")}
                </Link>
              </Button>
            </div>
          ) : null}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-gc-line pt-4">
          <Perf30dStat
            value={wl.perf30dPct}
            label={t("perf_30d_label")}
          />
          <CoinsStat count={wl.coinsCount} label={t("coins_count_label")} />
        </div>
      </header>

      <section className="bg-gc-bg-2 border border-gc-line rounded-2xl overflow-hidden">
        {wl.coins.length === 0 ? (
          <p className="text-sm text-gc-fg-3 text-center p-8">—</p>
        ) : (
          <ul>
            {wl.coins.map((c) => (
              <li
                key={c.symbol}
                className="flex items-center gap-3 px-4 py-3 border-b border-gc-line last:border-0"
              >
                <Link
                  href={`/coins/${c.symbol.toLowerCase()}`}
                  prefetch={false}
                  className="flex items-center gap-3 flex-1 min-w-0 group/coin"
                >
                  <CoinIcon
                    symbol={c.symbol}
                    name={c.name}
                    imageUrl={c.imageUrl}
                    size="md"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gc-fg truncate group-hover/coin:underline decoration-gc-line underline-offset-4">
                      {c.name}
                    </p>
                    <p className="text-[11px] uppercase tracking-wide text-gc-fg-3">
                      {c.symbol}
                    </p>
                  </div>
                </Link>
                <CoinPriceLabel
                  price={c.price}
                  change24h={c.change24h}
                  size="sm"
                  className="text-right shrink-0"
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

// ─── Stats blocks ──────────────────────────────────────────────────────

function Perf30dStat({
  value,
  label,
}: {
  value: number | null;
  label: string;
}) {
  if (value === null) {
    return (
      <div>
        <p className="text-2xl font-serif text-gc-fg-3 tabular-nums leading-none">
          —
        </p>
        <p className="text-[10px] uppercase tracking-wide text-gc-fg-3 mt-1.5">
          {label}
        </p>
      </div>
    );
  }
  const tone =
    value > 0 ? "text-gc-pos" : value < 0 ? "text-gc-neg" : "text-gc-fg-3";
  const sign = value > 0 ? "+" : "";
  return (
    <div>
      <p className={`text-2xl font-serif tabular-nums leading-none ${tone}`}>
        {sign}
        {value.toFixed(1)}%
      </p>
      <p className="text-[10px] uppercase tracking-wide text-gc-fg-3 mt-1.5">
        {label}
      </p>
    </div>
  );
}

function CoinsStat({ count, label }: { count: number; label: string }) {
  return (
    <div>
      <p className="text-2xl font-serif text-gc-fg tabular-nums leading-none">
        {count}
      </p>
      <p className="text-[10px] uppercase tracking-wide text-gc-fg-3 mt-1.5">
        {label}
      </p>
    </div>
  );
}

// ─── JSON-LD ───────────────────────────────────────────────────────────
//
// Type ItemList — Google riconosce e mostra rich snippet con il numero
// di item. Breadcrumb separato per "Home › @user › watchlist". Niente
// effetto se siteUrl e' vuoto (dev senza URL canonico).

function WatchlistJsonLd({
  wl,
  username,
  slug,
  siteUrl,
}: {
  wl: Awaited<ReturnType<typeof getPublicWatchlistByUserSlug>>;
  username: string;
  slug: string;
  siteUrl: string;
}) {
  if (!wl || !siteUrl) return null;
  const url = `${siteUrl}/w/${username}/${slug}`;
  const itemList: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: wl.name,
    description:
      wl.description ?? `Crypto watchlist by @${username}`,
    url,
    numberOfItems: wl.coinsCount,
    itemListElement: wl.coins.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: `${c.name} (${c.symbol})`,
      url: `${siteUrl}/coins/${c.symbol.toLowerCase()}`,
    })),
  };
  const breadcrumbs: Record<string, unknown> = {
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
        name: `@${username}`,
        item: `${siteUrl}/u/${username}`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: wl.name,
        item: url,
      },
    ],
  };
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemList) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }}
      />
    </>
  );
}
