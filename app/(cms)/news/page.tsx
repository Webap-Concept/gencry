// app/(cms)/news/page.tsx
//
// Home blog /news. Adatta dal mockup Claude Design ai dati reali del DB.
// Composizione di blocchi server-component sotto _components/; lo stile
// vive in _styles/news.css. Il layout (cms)/layout.tsx wrappa già con
// PublicHeader auth-aware + PublicFooter, qui ci pensiamo solo al corpo.

import type { Metadata } from "next";
import { getCachedAppSettings, getCachedSeoPage } from "@/lib/seo";
import { DEFAULT_LOCALE } from "@/lib/i18n/config";
import {
  getNewsCardsByCategories,
  getRecentPublishedNewsCards,
} from "@/lib/modules/news/queries";
import { resolvePlaceholders } from "@/lib/utils/content-placeholders";
import { NewsColumns, type NewsColumnGroup } from "./_components/news-columns";
import { NewsEssays } from "./_components/news-essays";
import { NewsFeatureStory } from "./_components/news-feature-story";
import { NewsHero } from "./_components/news-hero";
import { NewsNewsletter } from "./_components/news-newsletter";
import { NewsTicker } from "./_components/news-ticker";
import { NewsWatchlistPromo } from "./_components/news-watchlist-promo";
import "./_styles/news.css";

const PAGE_SIZE = 24; // fetch più del necessario, redistribuiamo nei blocchi
const ESSAYS_COUNT = 6;
const COLUMN_LIMIT = 4;

// Mappa categorie del DB → colonne tematiche editoriali.
const COLUMN_MAP: ReadonlyArray<{ name: string; sub: string; categories: string[] }> = [
  { name: "Mercati", sub: "→ Live & analisi",   categories: ["market", "bitcoin"] },
  { name: "Onchain", sub: "→ Ethereum & DeFi",  categories: ["ethereum", "defi", "altcoin"] },
  { name: "Guide",   sub: "→ Tech & policy",    categories: ["tech", "regulation", "other"] },
];

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const [seo, settings] = await Promise.all([
    getCachedSeoPage("/news", DEFAULT_LOCALE),
    getCachedAppSettings(),
  ]);
  const resolve = (text?: string | null) =>
    text ? resolvePlaceholders(text, settings) : undefined;
  return {
    title: resolve(seo?.title) ?? "News",
    description:
      resolve(seo?.description) ??
      "Notizie e analisi crypto curate dalla redazione di GenerazioneCrypto.",
    openGraph: {
      title: resolve(seo?.ogTitle) ?? resolve(seo?.title) ?? "News",
      description:
        resolve(seo?.ogDescription) ?? resolve(seo?.description) ?? undefined,
      type: "website",
    },
  };
}

export default async function NewsListingPage() {
  // 1 query "fat" per i recenti + N query mirate per le colonne. Mai più
  // di una decina di query, query DB cached per request via React `cache`.
  const [recent, ...byColumn] = await Promise.all([
    getRecentPublishedNewsCards(PAGE_SIZE),
    ...COLUMN_MAP.map((c) =>
      getNewsCardsByCategories(c.categories, COLUMN_LIMIT),
    ),
  ]);

  // Empty-state globale: nessun articolo pubblicato.
  if (recent.length === 0) {
    return (
      <>
        <NewsTicker />
        <NewsHero picks={[]} />
        <div className="news-container">
          <p className="news-empty">
            <em>↳</em> Nessun articolo pubblicato per il momento. Torna a
            trovarci a breve.
          </p>
        </div>
        <NewsWatchlistPromo />
        <NewsNewsletter />
      </>
    );
  }

  // Slicing: featureStory + 2 picks + 6 essays + 3 colonne.
  // - feature = il più recente
  // - picks = i 2 successivi
  // - essays = i 6 dopo i picks (può overlappare con quelli usati nelle
  //   colonne, è OK: meglio ridondanza che blocchi vuoti)
  const featureStory = recent[0] ?? null;
  const picks = recent.slice(1, 3);
  const essays = recent.slice(3, 3 + ESSAYS_COUNT);

  const groups: NewsColumnGroup[] = COLUMN_MAP.map((c, i) => ({
    name: c.name,
    sub: c.sub,
    items: byColumn[i] ?? [],
  }));

  return (
    <>
      <NewsTicker />
      <NewsHero picks={picks} />
      <NewsFeatureStory featured={featureStory} />
      <NewsColumns groups={groups} />
      <NewsEssays essays={essays} />
      <NewsWatchlistPromo />
      <NewsNewsletter />
    </>
  );
}
