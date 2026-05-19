// app/(cms)/news/_components/news-watchlist-promo.tsx
//
// Promo card "watchlist tematiche per abbonati". V1 STATICA (mockup):
// nessuna integrazione watchlist live. Quando ci sarà il modulo
// watchlist, qui dentro ci passeremo una watchlist reale via props.

import Link from "next/link";

interface PromoRow {
  symbol: string;
  mark: string;
  bg: string;
  price: string;
  change: string;
  pos: boolean;
}

const STATIC_ROWS: PromoRow[] = [
  { symbol: "BTC", mark: "B", bg: "#f7931a", price: "$118,420", change: "+2.10%", pos: true },
  { symbol: "ETH", mark: "E", bg: "#4b6fbf", price: "$4,820",   change: "−0.84%", pos: false },
  { symbol: "SOL", mark: "S", bg: "#fa8b1e", price: "$214.80",  change: "+8.42%", pos: true },
  { symbol: "TON", mark: "T", bg: "#0098ea", price: "$6.42",    change: "+3.71%", pos: true },
  { symbol: "SUI", mark: "S", bg: "#4ca2ff", price: "$4.18",    change: "+5.92%", pos: true },
];

export function NewsWatchlistPromo() {
  return (
    <div className="news-container">
      <section className="news-promo">
        <div>
          <div className="news-promo-eyebrow">
            <em>↳</em> Per gli abbonati
          </div>
          <h2 className="news-promo-title">
            Le watchlist <em>tematiche</em> della redazione.
          </h2>
          <p className="news-promo-sub">
            Liste curate ogni settimana — Layer 1, DeFi blue chip, AI×Crypto,
            Stablecoin yield. Con razionale scritto, non solo grafici.
          </p>
          <div className="news-promo-actions">
            <Link href="/" prefetch={false} className="news-promo-btn">
              Apri l&apos;app{" "}
              <span
                style={{
                  fontFamily: "var(--gc-display)",
                  fontStyle: "italic",
                  fontSize: 16,
                  lineHeight: 1,
                }}
              >
                →
              </span>
            </Link>
            <Link
              href="/explore"
              prefetch={false}
              className="news-promo-btn news-promo-btn-ghost"
            >
              Vedi un esempio
            </Link>
          </div>
        </div>
        <div className="news-promo-card">
          <div className="news-promo-card-h">
            <span>
              <em>↳</em> Watchlist · L1 Majors
            </span>
            <span>+12.4% MTD</span>
          </div>
          {STATIC_ROWS.map((r) => (
            <div className="news-promo-row" key={r.symbol}>
              <span className="news-promo-mark" style={{ background: r.bg }}>
                {r.mark}
              </span>
              <span className="news-promo-sym">{r.symbol}</span>
              <span className="news-promo-price">{r.price}</span>
              <span
                className={`news-promo-chg ${r.pos ? "news-pos" : "news-neg"}`}
              >
                {r.change}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
