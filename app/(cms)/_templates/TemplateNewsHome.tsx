// app/(cms)/_templates/TemplateNewsHome.tsx
//
// Template della home blog /news. Auto-discovered dal loader via slug
// "news-home". La logica è la stessa che viveva in app/(cms)/news/page.tsx
// (file route-based che verrà cancellato in step 4 del refactor
// news-categories-as-cms-pages, una volta che la migration SQL avrà
// promosso la page "news" da system meta-only a system_key=null +
// contentEditable=false via template.rules.contentLocked).
//
// Composizione di blocchi server-component sotto app/(cms)/news/_components/.
// Niente custom field: la pagina non legge `fields`, prende solo i dati
// dalle query news. SEO e og:image arrivano da seo_pages + cascade in
// cms-page.tsx, non serve generateMetadata qui.

import {
  getNewsCardsByCategories,
  getRecentPublishedNewsCards,
} from "@/lib/modules/news/queries";
import { NewsColumns, type NewsColumnGroup } from "../news/_components/news-columns";
import { NewsEssays } from "../news/_components/news-essays";
import { NewsFeatureStory } from "../news/_components/news-feature-story";
import { NewsFeaturedGrid } from "../news/_components/news-featured-grid";
import { NewsHero } from "../news/_components/news-hero";
import { NewsNewsletter } from "../news/_components/news-newsletter";
import { NewsTicker } from "../news/_components/news-ticker";
import "../news/_styles/news.css";
import type { TemplateProps } from "./types";

const PAGE_SIZE = 24; // fetch più del necessario, redistribuiamo nei blocchi
const FEATURED_GRID_COUNT = 6;
const ESSAYS_COUNT = 6;
const COLUMN_LIMIT = 4;

// Mappa categorie del DB → colonne tematiche editoriali. Resta categoria-based
// in questa milestone; in step 5 del refactor passerà a parent-page-based
// (le 7 categorie diventano page CMS figlie di /news).
const COLUMN_MAP: ReadonlyArray<{ name: string; sub: string; categories: string[] }> = [
  { name: "Mercati", sub: "→ Live & analisi",   categories: ["market", "bitcoin"] },
  { name: "Onchain", sub: "→ Ethereum & DeFi",  categories: ["ethereum", "defi", "altcoin"] },
  { name: "Guide",   sub: "→ Tech & policy",    categories: ["tech", "regulation", "other"] },
];

// `fields` non usato: il template non ha custom field configurabili.
// `template` non usato: nessuna logica condizionale sulla configurazione.
export async function TemplateNewsHome(_props: TemplateProps) {
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
