// app/(cms)/_templates/TemplateNewsCategory.tsx
//
// Template per la page categoria news (es. /news/bitcoin, /news/altcoin).
// Auto-discovered dal loader via slug "news-category". Listing degli
// articoli figli ordinati per published_at desc.
//
// Modello: la page categoria è figlia di /news (parent_id = id_news),
// e gli articoli sono figli della categoria (parent_id = id_categoria).
// La query filtra direttamente su pages.parent_id (vedi
// getNewsCardsByParentPageId in lib/modules/news/queries.ts).
//
// Custom field opzionale:
//   - description (textarea) → mostrata come sottotitolo sotto al titolo
//     della categoria. Se vuoto, niente sottotitolo.
//
// Niente content rich-text: il template viene usato con `contentLocked`,
// l'admin gestisce solo titolo + descrizione + SEO + ordinamento.

import { getNewsCardsByParentPageId } from "@/lib/modules/news/queries";
import { NewsFeaturedGrid } from "./news/news-featured-grid";
import { NewsNewsletter } from "./news/news-newsletter";
import "./news/news.css";
import type { TemplateProps } from "./types";

const CATEGORY_PAGE_SIZE = 60;

export async function TemplateNewsCategory({ page, fields }: TemplateProps) {
  const items = await getNewsCardsByParentPageId(page.id, CATEGORY_PAGE_SIZE);
  const description = fields.description?.trim() || null;

  return (
    <>
      <div className="news-container" style={{ paddingTop: "3rem", paddingBottom: "2rem" }}>
        <div className="news-article-eyebrow" style={{ marginBottom: "0.75rem" }}>
          <span>—</span>
          <span className="news-article-eyebrow-cat">Categoria news</span>
        </div>
        <h1 className="news-article-title" style={{ marginBottom: description ? "1rem" : 0 }}>
          {page.title}
        </h1>
        {description && <p className="news-article-lead">{description}</p>}
      </div>

      {items.length === 0 ? (
        <div className="news-container">
          <p className="news-empty">
            <em>↳</em> Nessun articolo in questa categoria per il momento.
          </p>
        </div>
      ) : (
        <NewsFeaturedGrid items={items} />
      )}

      <NewsNewsletter />
    </>
  );
}
