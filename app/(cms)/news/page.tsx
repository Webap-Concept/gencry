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
import { NewsFeaturedGrid } from "./_components/news-featured-grid";
import { NewsHero } from "./_components/news-hero";
import { NewsNewsletter } from "./_components/news-newsletter";
import { NewsTicker } from "./_components/news-ticker";
import "./_styles/news.css";

const PAGE_SIZE = 24; // fetch più del necessario, redistribuiamo nei blocchi
const FEATURED_GRID_COUNT = 6;
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
        <NewsNewsletter />
      </>
    );
  }

  // Slicing — gli indici partono da 0 e avanzano lineari:
  //   - featureStory = il più recente (0)
  //   - picks        = i 2 successivi (1..2) usati nell'hero
  //   - featuredGrid = i 6 dopo i picks (3..8) — griglia 3×2 sotto il feature
  //   - essays       = i 6 dopo la grid (9..14) per la sezione long-form
  // Se non ci sono abbastanza articoli, gli slice ritornano array più
  // corti e i componenti gestiscono il loro empty-state internamente.
  const featureStory = recent[0] ?? null;
  const picks = recent.slice(1, 3);
  const featuredGrid = recent.slice(3, 3 + FEATURED_GRID_COUNT);
  const essaysStart = 3 + FEATURED_GRID_COUNT;
  const essays = recent.slice(essaysStart, essaysStart + ESSAYS_COUNT);

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
      <NewsFeaturedGrid items={featuredGrid} />
      <NewsColumns groups={groups} />
      <NewsEssays essays={essays} />
      <NewsNewsletter />
    </>
  );
}
