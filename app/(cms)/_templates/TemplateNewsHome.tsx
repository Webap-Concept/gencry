// app/(cms)/_templates/TemplateNewsHome.tsx
//
// Template della home blog /news. Auto-discovered dal loader via slug
// "news-home". La page CMS "news" è ora una normal page (non più
// system meta-only) col template news-home assegnato — il routing
// catch-all `[locale]/[...slug]` la serve via CmsPage senza file route
// dedicato.
//
// IMPORTANTE: questo file vive nel CMS core (`app/(cms)/_templates/`),
// non dentro `lib/modules/news/`. Il modulo news AUTOMATIZZA un flusso
// (RSS ingestion → AI rewrite → publish con questo template) che un
// admin potrebbe replicare a mano. Se il modulo viene disinstallato:
// queste template restano + la page /news resta + gli articoli pubblicati
// restano. L'admin continua a creare manualmente nuovi articoli
// selezionando il template `news` + categoria come parent.
//
// Composizione di blocchi server-component sotto ./news/. Niente custom
// field: la pagina non legge `fields`, prende solo i dati dalle query
// news. SEO e og:image arrivano da seo_pages + cascade in cms-page.tsx,
// non serve generateMetadata qui.

import {
  getNewsCardsByCategories,
  getRecentPublishedNewsCards,
} from "@/lib/cms/news-feed-queries";
import { NewsColumns, type NewsColumnGroup } from "./news/news-columns";
import { NewsEssays } from "./news/news-essays";
import { NewsFeatureStory } from "./news/news-feature-story";
import { NewsFeaturedGrid } from "./news/news-featured-grid";
import { NewsHero } from "./news/news-hero";
import { NewsTicker } from "./news/news-ticker";
import "./news/news.css";
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
    </>
  );
}
