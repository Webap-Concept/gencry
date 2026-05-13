// app/(public)/coins/[symbol]/opengraph-image.tsx
// Open Graph image dinamica per ogni coin: card 1200x630 generata
// server-side al primo share, cachata da Vercel CDN. Twitter/Discord/
// Slack/LinkedIn la mostrano quando qualcuno linka /coins/<symbol>.
//
// Contenuto: icona coin grande + nome + simbolo + prezzo attuale +
// variazione 24h colorata + mini-sparkline 7gg + logo Generazione
// Crypto + claim social.
//
// IMPORTANTE: niente Tailwind (ImageResponse non lo supporta), tutto
// inline style. Niente <img> con URL R2 cross-origin? Vercel
// ImageResponse FA fetch dell'URL → ok purché R2 sia pubblico. Per
// sicurezza, se l'URL non risponde, fallback al letter circle.

import { ImageResponse } from "next/og";
import { getCoinForCard } from "@/lib/modules/prices/queries";
import { getCachedAppSettings } from "@/lib/seo";

export const runtime = "nodejs";
export const alt = "Coin price card";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// ---------------------------------------------------------------------------
// Helpers (no Tailwind, no DOM browser APIs)
// ---------------------------------------------------------------------------

const BRAND_ORANGE = "#fa8b1e";
const POS = "#2d8659";
const NEG = "#c2553f";
const FG = "#123928";
const FG_2 = "#5c5146";
const FG_3 = "#94897a";
const BG = "#f5f0e8";
const BG_2 = "#fdfaf4";
const LINE = "#e6dfd0";

function formatPrice(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "$0";
  const abs = Math.abs(value);
  if (abs < 0.01) return `$${value.toPrecision(4)}`;
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatChange(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function trendColor(points: number[] | null, change24h: number | null): string {
  if (points && points.length >= 2) {
    const first = points[0];
    const last = points[points.length - 1];
    if (Number.isFinite(first) && Number.isFinite(last)) {
      const delta = (last - first) / Math.max(Math.abs(first), 1e-12);
      if (delta > 0.001) return POS;
      if (delta < -0.001) return NEG;
    }
  }
  if (change24h === null) return FG_3;
  if (change24h > 0) return POS;
  if (change24h < 0) return NEG;
  return FG_3;
}

/**
 * Genera il path SVG della mini-sparkline. Stessa logica di
 * MiniSparkline ma inline (l'ImageResponse non può importare client
 * components con `use client`).
 */
function buildSparklinePath(
  points: number[],
  width: number,
  height: number,
): { line: string; area: string } | null {
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const pad = 4;
  const w = width - pad * 2;
  const h = height - pad * 2;

  const coords = points.map((p, i) => {
    const x = pad + (i / (points.length - 1)) * w;
    const y = pad + h - ((p - min) / range) * h;
    return { x, y };
  });

  const line = coords
    .map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
    .join(" ");
  const last = coords[coords.length - 1];
  const first = coords[0];
  const area = `${line} L ${last.x.toFixed(1)} ${height} L ${first.x.toFixed(1)} ${height} Z`;
  return { line, area };
}

// ---------------------------------------------------------------------------
// Image
// ---------------------------------------------------------------------------

export default async function CoinOgImage({
  params,
}: {
  // Next 16: anche le OG image hanno params come Promise.
  params: Promise<{ symbol: string }>;
}) {
  const { symbol } = await params;
  const [coin, settings] = await Promise.all([
    getCoinForCard(symbol),
    getCachedAppSettings(),
  ]);

  const appName = settings.app_name?.trim() || "Generazione Crypto";
  const appLogoUrl = settings.app_logo_url ?? null;
  const claim = "La community italiana delle crypto.";

  // Fallback: coin non trovato → card generica
  if (!coin) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: BG,
            color: FG,
            fontSize: 48,
          }}
        >
          {appName}
        </div>
      ),
      { ...size },
    );
  }

  const trend = trendColor(coin.weeklySparkline, coin.change24h);
  const spark = coin.weeklySparkline && buildSparklinePath(coin.weeklySparkline, 1080, 200);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: BG,
          padding: "48px 64px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          fontFamily: "sans-serif",
        }}
      >
        {/* Top: coin badge + name + price */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 32,
          }}
        >
          {coin.imageUrl ? (
            <img
              src={coin.imageUrl}
              alt=""
              width={120}
              height={120}
              style={{
                borderRadius: "50%",
                objectFit: "cover",
              }}
            />
          ) : (
            <div
              style={{
                width: 120,
                height: 120,
                borderRadius: "50%",
                background: BG_2,
                border: `2px solid ${LINE}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 56,
                fontWeight: 700,
                color: FG_2,
              }}
            >
              {coin.symbol.charAt(0)}
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 64,
                fontWeight: 600,
                color: FG,
                lineHeight: 1,
              }}
            >
              {coin.name}
            </div>
            <div
              style={{
                display: "flex",
                marginTop: 8,
                fontSize: 28,
                color: FG_3,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              {`${coin.symbol}${coin.category ? `  ·  ${coin.category}` : ""}${
                typeof coin.marketCapRank === "number" && coin.marketCapRank > 0
                  ? `  ·  #${coin.marketCapRank}`
                  : ""
              }`}
            </div>
          </div>
        </div>

        {/* Price + change block */}
        <div style={{ display: "flex", flexDirection: "column", marginTop: 8 }}>
          <div
            style={{
              fontSize: 96,
              fontWeight: 700,
              color: FG,
              lineHeight: 1,
              letterSpacing: "-0.02em",
            }}
          >
            {formatPrice(coin.price)}
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 8,
              fontSize: 36,
              fontWeight: 600,
              color: trend,
            }}
          >
            {`${formatChange(coin.change24h)} (24h)`}
          </div>
        </div>

        {/* Sparkline */}
        {spark && (
          <svg width={1080} height={200} viewBox="0 0 1080 200" style={{ marginTop: -24 }}>
            <defs>
              <linearGradient id="og-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={trend} stopOpacity="0.35" />
                <stop offset="100%" stopColor={trend} stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={spark.area} fill="url(#og-grad)" />
            <path d={spark.line} fill="none" stroke={trend} strokeWidth={3} />
          </svg>
        )}

        {/* Footer: brand + claim */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingTop: 24,
            borderTop: `1px solid ${LINE}`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {appLogoUrl ? (
              <img
                src={appLogoUrl}
                alt=""
                height={56}
                style={{ width: "auto" }}
              />
            ) : (
              <div
                style={{
                  display: "flex",
                  fontSize: 28,
                  fontWeight: 500,
                  color: FG,
                  letterSpacing: "-0.01em",
                }}
              >
                <span>generazione</span>
                <span style={{ color: BRAND_ORANGE }}>crypto</span>
              </div>
            )}
          </div>
          <div
            style={{
              fontSize: 22,
              color: FG_2,
              fontStyle: "italic",
            }}
          >
            {claim}
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
