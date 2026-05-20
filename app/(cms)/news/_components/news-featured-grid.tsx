// app/(cms)/news/_components/news-featured-grid.tsx
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
import { pickMediaVariantUrl } from "@/lib/storage/media-asset-processor";

// Etichette IT dei badge categoria (uppercase, mostrate nel pill).
// Allineate con CATEGORY_LABELS di `cms-extension.ts` ma "frontend voice":
// più editoriale (es. "Regolamentazione" invece di "Regulation").
const CATEGORY_LABEL: Record<string, string> = {
  bitcoin: "Bitcoin",
  ethereum: "Ethereum",
  altcoin: "Altcoin",
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
