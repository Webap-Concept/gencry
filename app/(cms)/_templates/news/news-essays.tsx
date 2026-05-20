// app/(cms)/_templates/news/news-essays.tsx
//
// Grid 3 colonne di articoli "long-form". V1: gli ultimi 3 articoli per
// data dopo i picks Hero + il Feature (esclusi via offset nella query
// sopra). Non c'è ancora un concetto di "long-form vs flash news"
// — quando avremo `reading_time` o un flag editoriale, filtreremo qui.

import Link from "next/link";
import type { NewsCardData } from "@/lib/modules/news/queries";

function formatItDate(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function NewsEssays({ essays }: { essays: NewsCardData[] }) {
  if (essays.length === 0) return null;

  return (
    <div className="news-container">
      <div className="news-section-h">
        <h2>
          <em>Saggi</em> & long-form
        </h2>
        <div className="news-section-meta">
          → <strong>{essays.length} pezzi</strong> · letture lente
        </div>
      </div>
      <div className="news-essays">
        {essays.map((e, idx) => (
          <Link
            key={e.pageId}
            href={`/${e.slug}`}
            prefetch={false}
            className="news-essay"
          >
            <span className="news-essay-num">
              {String(idx + 1).padStart(2, "0")}
            </span>
            <div className="news-essay-eyebrow">
              <em>{e.category ?? "News"}</em>
              <span className="news-sep">·</span>
              GenerazioneCrypto
            </div>
            <h3 className="news-essay-title">{e.title}</h3>
            {e.excerpt && <p className="news-essay-excerpt">{e.excerpt}</p>}
            <div className="news-essay-foot">
              <span>{formatItDate(e.publishedAt)}</span>
              <strong>→</strong>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
