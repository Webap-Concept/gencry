"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// Monete cadenti — icone SVG inline (currentColor) così l'unica fonte di
// verità per la tinta è la classe .gc404-coin-* sul wrapper.
function BtcIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5">
      <path d="M9 4v3M9 17v3M14 4v3M14 17v3" />
      <path d="M7 7h7a3 3 0 0 1 0 6H7zM7 13h8a3 3 0 0 1 0 6H7z" />
    </svg>
  );
}
function EthIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M12 2 5 13l7 4 7-4-7-11Zm0 17-7-4 7 9 7-9-7 4Z" />
    </svg>
  );
}
function SolIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M5 6h13l-2 3H3zM3 11h13l2 3H5zM5 16h13l-2 3H3z" />
    </svg>
  );
}
function DogeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5">
      <path d="M5 5h6a7 7 0 0 1 0 14H5z" />
      <path d="M3 12h7" />
    </svg>
  );
}
function AdaIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5">
      <path d="M5 20 12 4l7 16M8 14h8" />
    </svg>
  );
}

const COINS = [
  { Icon: BtcIcon, cls: "gc404-coin-btc", left: "8%", dur: "5.5s", delay: "1.2s" },
  { Icon: EthIcon, cls: "gc404-coin-eth", left: "22%", dur: "6.2s", delay: "2s" },
  { Icon: SolIcon, cls: "gc404-coin-sol", left: "78%", dur: "5s", delay: "2.6s" },
  { Icon: DogeIcon, cls: "gc404-coin-doge", left: "92%", dur: "6.8s", delay: "3.4s" },
  { Icon: AdaIcon, cls: "gc404-coin-ada", left: "50%", dur: "6.4s", delay: "4s" },
];

// Default usato quando la system page CMS è assente o ha content vuoto.
// Tenuto qui (non in app/not-found.tsx) per centralizzare il copy del
// componente. È HTML perché lo rendiamo via dangerouslySetInnerHTML —
// l'editor admin produce già markup, e così la fallback è omogenea.
const DEFAULT_DESCRIPTION_HTML =
  "<p>L'asset che cercavi non è in portafoglio. Forse è stata rugpullata, forse l'hai scritta male — succede ai migliori. Torna alla home e riparti dai movimenti del giorno.</p>";

export function Crash404({
  descriptionHtml,
}: {
  descriptionHtml?: string | null;
}) {
  const [price, setPrice] = useState("$0.000123");
  const [change, setChange] = useState("−99.87%");
  const [vol, setVol] = useState("1.234");

  useEffect(() => {
    const tick = () => {
      const p = (Math.random() * 0.0009 + 0.0001).toFixed(6);
      const c = (-99.5 - Math.random() * 0.49).toFixed(2);
      const v = Math.floor(Math.random() * 9000 + 200);
      setPrice("$" + p);
      setChange("−" + Math.abs(Number(c)).toFixed(2) + "%");
      setVol(v.toLocaleString("it-IT"));
    };
    tick();
    const id = window.setInterval(tick, 1100);
    return () => window.clearInterval(id);
  }, []);

  return (
    <main className="relative z-10 mx-auto max-w-[1100px] px-5 pb-16 pt-2 text-center md:px-8">
      {COINS.map((c, i) => (
        <span
          key={i}
          aria-hidden
          className={`gc404-coin ${c.cls}`}
          style={{
            top: "-10%",
            left: c.left,
            animationDuration: c.dur,
            animationDelay: c.delay,
          }}>
          <c.Icon />
        </span>
      ))}

      <span
        className="gc404-fade-up inline-flex items-center gap-2 rounded-full border border-gc-line bg-gc-bg-2 px-[14px] py-[7px] font-mono text-[11.5px] uppercase tracking-[0.1em] text-gc-fg-3"
        style={{ animationDelay: "0.05s" }}>
        <em className="font-display text-[14px] italic text-gc-accent normal-case tracking-normal">
          ↯
        </em>
        codice 404 · asset non in portafoglio
      </span>

      <div className="relative mx-auto mt-7 aspect-[880/360] w-full max-w-[880px] max-md:aspect-[880/380]">
        <svg
          viewBox="0 0 880 360"
          aria-hidden
          preserveAspectRatio="xMidYMid meet"
          className="absolute inset-0 h-full w-full overflow-visible">
          <defs>
            <linearGradient id="gc404-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fa8b1e" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#fa8b1e" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Faint candlesticks dietro il digit */}
          <g style={{ color: "var(--gc-pos)", opacity: 0.5 }}>
            <line className="gc404-candle" x1="40" y1="120" x2="40" y2="200" stroke="currentColor" strokeWidth="1.4" style={{ animationDelay: "0.1s" }} />
            <rect className="gc404-candle" x="32" y="140" width="16" height="50" fill="currentColor" style={{ animationDelay: "0.1s" }} />
            <line className="gc404-candle" x1="90" y1="105" x2="90" y2="190" stroke="currentColor" strokeWidth="1.4" style={{ animationDelay: "0.18s" }} />
            <rect className="gc404-candle" x="82" y="120" width="16" height="60" fill="currentColor" style={{ animationDelay: "0.18s" }} />
          </g>
          <g style={{ color: "var(--gc-neg)", opacity: 0.5 }}>
            <line className="gc404-candle" x1="140" y1="130" x2="140" y2="225" stroke="currentColor" strokeWidth="1.4" style={{ animationDelay: "0.26s" }} />
            <rect className="gc404-candle" x="132" y="150" width="16" height="60" fill="currentColor" style={{ animationDelay: "0.26s" }} />
          </g>
          <g style={{ color: "var(--gc-pos)", opacity: 0.5 }}>
            <line className="gc404-candle" x1="190" y1="140" x2="190" y2="240" stroke="currentColor" strokeWidth="1.4" style={{ animationDelay: "0.34s" }} />
            <rect className="gc404-candle" x="182" y="160" width="16" height="65" fill="currentColor" style={{ animationDelay: "0.34s" }} />
          </g>

          {/* "404" — fill che fade-in dopo lo stroke */}
          <text
            className="gc404-digit-fill font-display"
            x="50%"
            y="270"
            textAnchor="middle"
            style={{ fontStyle: "italic", fontSize: 360, lineHeight: 1, letterSpacing: "-0.04em" }}>
            404
          </text>
          <text
            className="gc404-digit-stroke font-display"
            x="50%"
            y="270"
            textAnchor="middle"
            style={{ fontStyle: "italic", fontSize: 360, lineHeight: 1, letterSpacing: "-0.04em" }}>
            404
          </text>

          <path
            className="gc404-chart-area"
            d="M 60,150 C 130,135 180,180 230,160 C 280,140 320,210 380,200 C 430,195 470,140 540,150 C 600,160 650,260 760,320 L 760,360 L 60,360 Z"
          />
          <path
            className="gc404-chart-line"
            d="M 60,150 C 130,135 180,180 230,160 C 280,140 320,210 380,200 C 430,195 470,140 540,150 C 600,160 650,260 760,320"
          />

          <g className="gc404-splat">
            <circle cx="760" cy="320" r="14" fill="none" stroke="var(--gc-neg)" strokeWidth="1.5" />
            <circle cx="760" cy="320" r="22" fill="none" stroke="var(--gc-neg)" strokeWidth="1.5" opacity="0.55" />
            <circle cx="760" cy="320" r="32" fill="none" stroke="var(--gc-neg)" strokeWidth="1.5" opacity="0.25" />
          </g>

          <circle className="gc404-crash-dot" cx="760" cy="320" r="8" />
        </svg>
      </div>

      <h1
        className="gc404-fade-up font-display mt-7 mb-2 text-[clamp(28px,4vw,40px)] leading-[1.1] tracking-[-0.015em] text-gc-fg"
        style={{ animationDelay: "1.1s" }}>
        Questa pagina è andata <em className="text-gc-accent">−99.9%</em>
      </h1>
      {/* HTML sanitizzato server-side. `<div>` esterno (non `<p>`) per
          evitare il nesting invalido `<p><p>...</p></p>` quando il content
          dall'editor è già wrappato in <p>. */}
      <div
        className="gc404-fade-up mx-auto max-w-[520px] text-center text-[15px] text-gc-fg-3 text-pretty"
        style={{ animationDelay: "1.3s" }}
        dangerouslySetInnerHTML={{
          __html: descriptionHtml || DEFAULT_DESCRIPTION_HTML,
        }}
      />

      <div
        className="gc404-fade-up mx-auto mt-[22px] inline-flex max-w-full flex-wrap items-center gap-[18px] rounded-[14px] bg-gc-fg px-5 py-[14px] font-mono text-[12.5px]"
        style={{ animationDelay: "1.5s" }}
        role="status"
        aria-live="polite">
        <span className="font-display text-[18px] italic text-gc-bg tracking-[0.01em]">$404</span>
        <span className="text-[rgba(245,236,220,0.6)]">PRICE</span>
        <span className="tabular-nums text-white tracking-[0.02em]">{price}</span>
        <span className="hidden h-[14px] w-px bg-[rgba(245,236,220,0.2)] sm:inline-block" />
        <span className="text-[rgba(245,236,220,0.6)]">24H</span>
        <span className="text-[#e89886]">{change}</span>
        <span className="hidden h-[14px] w-px bg-[rgba(245,236,220,0.2)] sm:inline-block" />
        <span className="text-[rgba(245,236,220,0.6)]">VOL</span>
        <span className="tabular-nums text-white tracking-[0.02em]">{vol}</span>
      </div>

      <div
        className="gc404-fade-up mt-6 flex flex-wrap justify-center gap-2.5"
        style={{ animationDelay: "1.7s" }}>
        <Link
          href="/"
          className="inline-flex items-center gap-[7px] rounded-full bg-gc-accent px-5 py-[11px] text-[13.5px] font-medium text-white transition hover:brightness-95 active:translate-y-px">
          ← Torna alla home
        </Link>
      </div>
    </main>
  );
}
