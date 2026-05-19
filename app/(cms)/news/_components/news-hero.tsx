// app/(cms)/news/_components/news-hero.tsx
//
// Hero del blog: titolo grande editoriale + 2 picks (i 2 articoli più
// recenti). Le metriche (numero articoli, lettori, tempo medio, ultimo
// aggiornamento) sono V1 hardcoded — diventeranno widget admin futuri.

import Link from "next/link";
import type { NewsCardData } from "@/lib/modules/news/queries";

const HERO_TITLE = (
  <>
    Capire il mercato, <em>una storia</em> alla volta.
  </>
);
const HERO_EYEBROW = "Editoriale · Crypto journal · Aggiornato ogni giorno";

function formatItDate(d: Date): string {
  return d.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export function NewsHero({ picks }: { picks: NewsCardData[] }) {
  const latestDate =
    picks[0]?.publishedAt ?? null; // mostriamo l'ultima pubblicazione invece di numeri inventati

  return (
    <header className="news-hero">
      <div className="news-container">
        <div className="news-hero-grid">
          <div>
            <div className="news-eyebrow">
              <em>↳</em> {HERO_EYEBROW}
            </div>
            <h1 className="news-hero-title">{HERO_TITLE}</h1>
            <div className="news-hero-meta">
              <div className="news-hero-meta-cell">
                In libreria
                <strong>
                  — <em>articoli</em>
                </strong>
              </div>
              <div className="news-hero-meta-cell">
                Aggiornato
                <strong>
                  {latestDate ? formatItDate(latestDate) : "—"}
                </strong>
              </div>
            </div>
          </div>
          <aside className="news-hero-side">
            {picks.length > 0 ? (
              picks.slice(0, 2).map((pick, i) => (
                <Link
                  key={pick.pageId}
                  href={`/${pick.slug}`}
                  prefetch={false}
                  className="news-pick"
                >
                  <div className="news-eyebrow">
                    <em>↳</em> {i === 0 ? "Editor's pick" : "Più recente"}
                  </div>
                  <h3 className="news-pick-title">{pick.title}</h3>
                  <div className="news-pick-foot">
                    <span>
                      {pick.publishedAt ? formatItDate(pick.publishedAt) : "—"}
                    </span>
                    <span className="news-pick-arrow">→</span>
                  </div>
                </Link>
              ))
            ) : (
              <div className="news-pick">
                <div className="news-eyebrow">
                  <em>↳</em> In arrivo
                </div>
                <h3 className="news-pick-title">
                  I primi articoli saranno qui a breve.
                </h3>
              </div>
            )}
          </aside>
        </div>
      </div>
    </header>
  );
}
