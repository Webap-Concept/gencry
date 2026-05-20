// app/(cms)/_templates/news/news-columns.tsx
//
// 3 colonne tematiche del listing. Ogni colonna raggruppa N categorie
// del DB sotto un label editoriale. La mappatura sta qui (config),
// niente colonne se la categoria non ha articoli.

import Link from "next/link";
import type { NewsCardData } from "@/lib/modules/news/queries";

export interface NewsColumnGroup {
  name: string;
  /** Label sotto-titolo (es. "→ Settimana 19", "→ 4 nuovi") */
  sub: string;
  items: NewsCardData[];
}

export function NewsColumns({ groups }: { groups: NewsColumnGroup[] }) {
  if (groups.every((g) => g.items.length === 0)) return null;

  return (
    <div className="news-container">
      <section className="news-columns">
        {groups.map((col) => (
          <div className="news-col" key={col.name}>
            <div className="news-col-head">
              <h3>
                <em>{col.name}</em>
              </h3>
              <span className="news-col-num">{col.sub}</span>
            </div>
            <div className="news-col-list">
              {col.items.length === 0 ? (
                <div className="news-col-empty">In arrivo a breve.</div>
              ) : (
                col.items.map((it, idx) => (
                  <Link
                    key={it.pageId}
                    href={`/${it.slug}`}
                    prefetch={false}
                    className="news-col-item"
                  >
                    <span className="news-col-item-num">
                      {String(idx + 1).padStart(2, "0")}
                    </span>
                    <div className="news-col-item-body">
                      <h4 className="news-col-item-title">{it.title}</h4>
                      <div className="news-col-item-meta">
                        {it.category ?? "News"}
                        {it.publishedAt && (
                          <>
                            {" · "}
                            {it.publishedAt.toLocaleDateString("it-IT", {
                              day: "2-digit",
                              month: "short",
                            })}
                          </>
                        )}
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
