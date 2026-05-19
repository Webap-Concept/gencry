// app/(cms)/news/_components/news-feature-story.tsx
//
// Card grande "feature story" sotto l'hero. Mostra l'articolo più
// recente con hero image full-bleed + excerpt + CTA. Se non c'è un
// featured (nessun articolo pubblicato), il componente NON renderizza
// niente (la page sopra gestisce l'empty state globale).

import Link from "next/link";
import type { NewsCardData } from "@/lib/modules/news/queries";

function formatItDate(d: Date): string {
  return d.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export function NewsFeatureStory({ featured }: { featured: NewsCardData | null }) {
  if (!featured) return null;

  return (
    <div className="news-container">
      <article className="news-feature">
        <Link href={`/${featured.slug}`} prefetch={false} className="news-feat-cover">
          {featured.heroUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={featured.heroUrl} alt="" />
          )}
          <span className="news-feat-cover-tag">
            <em>↳</em> In copertina
          </span>
          <span className="news-feat-cover-num">
            {featured.publishedAt ? formatItDate(featured.publishedAt) : "—"}
          </span>
        </Link>
        <div className="news-feat-body">
          <div className="news-feat-eyebrow">
            <em>{featured.category ?? "News"}</em>
          </div>
          <h2 className="news-feat-title">{featured.title}</h2>
          {featured.excerpt && (
            <p className="news-feat-excerpt">{featured.excerpt}</p>
          )}
          <div className="news-feat-foot">
            <span className="news-eyebrow">
              <em>↳</em> GenerazioneCrypto
            </span>
            <Link
              href={`/${featured.slug}`}
              prefetch={false}
              className="news-feat-cta"
            >
              Leggi il pezzo <em>→</em>
            </Link>
          </div>
        </div>
      </article>
    </div>
  );
}
