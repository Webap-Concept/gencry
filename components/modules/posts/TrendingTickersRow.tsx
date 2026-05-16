// components/modules/posts/TrendingTickersRow.tsx
//
// Server Component: top N ticker più menzionati nelle ultime 24h.
// Renderizzato in cima a /explore come row di pill cliccabili.
//
// Cache lato data fetcher (unstable_cache 5min) — vedi getCachedTrending.
// Pattern GetStream §8: trending è una query separata, non parte del
// feed cronologico → niente impatto su getFeedIds().
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { TrendingUp } from "lucide-react";
import { unstable_cache } from "next/cache";
import { getTrendingTickers } from "@/lib/modules/posts/queries";

const TRENDING_TAG = "posts:trending-tickers";

/**
 * Cache 5 minuti. Tag `posts:trending-tickers` per invalidazione
 * mirata se in futuro qualcuno vuole forzare il refresh
 * (es. dopo bulk import o cleanup admin).
 */
const getCachedTrending = unstable_cache(
  async () => getTrendingTickers({ windowHours: 24, limit: 10 }),
  ["posts-trending-tickers-24h-top10"],
  { revalidate: 300, tags: [TRENDING_TAG] },
);

export async function TrendingTickersRow({
  activeTicker,
}: {
  /** Se settato, il pill matching è marcato come "selezionato". */
  activeTicker?: string | null;
}) {
  const rows = await getCachedTrending();
  if (rows.length === 0) return null;

  const t = await getTranslations("posts.trending");

  return (
    <section
      aria-labelledby="trending-tickers-heading"
      className="rounded-2xl border border-gc-line bg-gc-bg-2 p-4">
      <h2
        id="trending-tickers-heading"
        className="flex items-center gap-2 text-xs uppercase tracking-wider text-gc-fg-3 mb-3">
        <TrendingUp size={13} strokeWidth={1.75} aria-hidden />
        {t("section_title")}
      </h2>
      <ul className="flex flex-wrap gap-2">
        {rows.map((r) => {
          const isActive =
            activeTicker && activeTicker.toUpperCase() === r.ticker;
          return (
            <li key={r.ticker}>
              <Link
                href={`/explore?ticker=${r.ticker}`}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-gc-accent text-white"
                    : "bg-gc-bg-3 text-gc-fg hover:bg-gc-line"
                }`}>
                <span>${r.ticker}</span>
                <span
                  className={`text-[11px] ${isActive ? "text-white/80" : "text-gc-fg-3"}`}>
                  {r.postCount}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
