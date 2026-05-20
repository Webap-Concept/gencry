// app/(cms)/_templates/news/news-featured-grid.tsx
//
// Griglia 3×2 di card sotto la "feature story". Stile mockup Claude
// Design: cover image full-bleed sopra, pill categoria top-left, sotto
// la card meta + titolo serif + excerpt + author.
//
// Nessun chip metriche e nessun glyph decorativo: usiamo l'hero image
// dell'articolo come elemento visivo (cover area). Se manca, la cover
// resta vuota con background neutro (skeleton-style).

import Link from "next/link";
import type { NewsCardData } from "@/lib/modules/news/queries";
import {
  getMediaSrcset,
  pickMediaVariantUrl,
} from "@/lib/storage/media-asset-processor";

// Etichette IT dei badge categoria (uppercase, mostrate nel pill).
// "Frontend voice" — più editoriale rispetto al codice enum
// (es. "Regolamentazione" invece di "Regulation"). Map locale al
// componente perché serve solo qui per il pill della card.
const CATEGORY_LABEL: Record<string, string> = {
  bitcoin: "Bitcoin",
  ethereum: "Ethereum",
  altcoin: "Altcoin",
  stablecoin: "Stablecoin",
  defi: "DeFi",
  regulation: "Regolamentazione",
  market: "Mercati",
  tech: "Tech",
  other: "News",
};

function formatItDate(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

const AUTHOR_NAME = "Redazione";

export function NewsFeaturedGrid({ items }: { items: NewsCardData[] }) {
  if (items.length === 0) return null;

  return (
    <div className="news-container">
      <div className="news-featured-grid">
        {items.slice(0, 6).map((item) => {
          const catLabel =
            CATEGORY_LABEL[item.category ?? "other"] ?? "News";
          return (
            <Link
              key={item.pageId}
              href={`/${item.slug}`}
              prefetch={false}
              className="news-fg-card"
            >
              <div className="news-fg-cover">
                {item.heroUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={pickMediaVariantUrl(item.heroVariants, item.heroUrl, "card")}
                    srcSet={getMediaSrcset(item.heroVariants)}
                    // Grid 3 col su desktop (~400px), 2 col su tablet
                    // (~50vw), 1 col mobile (100vw). Browser sceglie
                    // thumb 400w su desktop, card 800w su tablet/mobile.
                    sizes="(max-width: 640px) 100vw, (max-width: 1000px) 50vw, 400px"
                    alt=""
                    loading="lazy"
                  />
                ) : null}
                <span className="news-fg-cat">{catLabel}</span>
              </div>
              <div className="news-fg-body">
                <h3 className="news-fg-title">{item.title}</h3>
                {item.excerpt && (
                  <p className="news-fg-excerpt">{item.excerpt}</p>
                )}
                <div className="news-fg-foot">
                  <span className="news-fg-avatar">
                    {AUTHOR_NAME.slice(0, 1)}
                  </span>
                  <div className="news-fg-foot-meta">
                    <div className="news-fg-author">{AUTHOR_NAME}</div>
                    <div className="news-fg-date">
                      {formatItDate(item.publishedAt)}
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
