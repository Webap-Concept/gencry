// components/modules/posts/PostBody.tsx
//
// Rendering del body di un post con auto-link di:
//   - `$TICKER` esplicito (case-insensitive: $btc, $Btc, $BTC matchano)
//   - Nome esteso del coin senza `$` (es. "Bitcoin", "solana"): match
//     contro `coinNameMap` (whitelist sui coin attivi nel pricing).
//     Word boundary + tokenize, niente regex alternation → O(1) per
//     coin lookup, scala fino a 100k+ coin senza degradare.
//   - `@user` mention
//   - URL nudi http(s)
//
// Plain-text in, JSX out — niente markdown.
//
// La mappa coin arriva come prop dal Server Component padre (typically
// PostCard via Server Components ascendenti come PostsFeedSection,
// CoinRelatedPostsSection, /post/[id]/page). Senza la mappa, il match
// dei nomi estesi viene saltato gracefully — solo i `$TICKER` espliciti
// vengono linkati.
import Link from "next/link";
import type { JSX } from "react";
import type { TickerPreviewData } from "@/lib/modules/posts/ticker-preview-actions";
import { TickerHoverCard } from "./TickerHoverCard";

const TICKER_REGEX = /\$([A-Za-z][A-Za-z0-9]{1,19})\b/g;
const MENTION_REGEX = /@([A-Za-z][A-Za-z0-9_]{2,29})\b/g;
const URL_REGEX = /https?:\/\/[^\s<>]+/g;
const WORD_REGEX = /\b[A-Za-z][A-Za-z0-9]{2,}\b/g;

type Token =
  | { type: "text"; value: string }
  | { type: "ticker"; symbol: string; display: string }
  | { type: "mention"; username: string }
  | { type: "url"; href: string; display: string };

type Match = {
  start: number;
  end: number;
  token: Exclude<Token, { type: "text" }>;
};

function collectMatches(
  body: string,
  coinNameMap: Record<string, string> | undefined,
): Match[] {
  const out: Match[] = [];

  for (const m of body.matchAll(TICKER_REGEX)) {
    const start = m.index!;
    const symbol = m[1].toUpperCase();
    out.push({
      start,
      end: start + m[0].length,
      token: { type: "ticker", symbol, display: m[0] },
    });
  }

  for (const m of body.matchAll(MENTION_REGEX)) {
    const start = m.index!;
    out.push({
      start,
      end: start + m[0].length,
      token: { type: "mention", username: m[1] },
    });
  }

  for (const m of body.matchAll(URL_REGEX)) {
    const start = m.index!;
    const href = m[0];
    const display = href.length > 60 ? href.slice(0, 57) + "…" : href;
    out.push({
      start,
      end: start + m[0].length,
      token: { type: "url", href, display },
    });
  }

  // Implicit coin-name match: only if a whitelist is provided. Skips
  // words that overlap with existing matches (e.g. "bitcoin" inside
  // `$bitcoin` already matched by TICKER_REGEX).
  if (coinNameMap) {
    for (const m of body.matchAll(WORD_REGEX)) {
      const symbol = coinNameMap[m[0].toLowerCase()];
      if (!symbol) continue;
      const start = m.index!;
      const end = start + m[0].length;
      // O(N) overlap check on matches collected so far. N stays small
      // (typically < 10 per post), trascurabile.
      const overlaps = out.some((x) => x.start < end && x.end > start);
      if (overlaps) continue;
      out.push({
        start,
        end,
        token: { type: "ticker", symbol, display: m[0] },
      });
    }
  }

  out.sort((a, b) => a.start - b.start);
  return out;
}

function tokenize(
  body: string,
  coinNameMap: Record<string, string> | undefined,
): Token[] {
  const matches = collectMatches(body, coinNameMap);
  const out: Token[] = [];
  let cursor = 0;
  for (const m of matches) {
    if (m.start > cursor) {
      out.push({ type: "text", value: body.slice(cursor, m.start) });
    }
    out.push(m.token);
    cursor = m.end;
  }
  if (cursor < body.length) {
    out.push({ type: "text", value: body.slice(cursor) });
  }
  return out;
}

// `relative z-[1]` è obbligatorio: PostCard ha uno stretched-link
// overlay sopra il body per intercettare i click sul "vuoto" e
// navigare a /post/{id}. Senza relative+zIndex i Link interni
// (ticker/mention/url) finiscono sotto l'overlay e il click vola
// sul post invece che sul target del link.
const LINK_CLASS =
  "relative z-[1] text-gc-accent hover:underline underline-offset-2 decoration-gc-accent/60";

export function PostBody({
  body,
  coinNameMap,
  tickerPreviewMap,
}: {
  body: string;
  /** Mappa lower-name → SYMBOL fornita dal Server Component padre.
   *  Senza, i nomi estesi non vengono linkati (degradazione graceful). */
  coinNameMap?: Record<string, string>;
  /** Preview SSR-prefetched per i ticker visibili. Senza, il
   *  TickerHoverCard fa lazy fetch al primo open. */
  tickerPreviewMap?: Record<string, TickerPreviewData>;
}): JSX.Element {
  const tokens = tokenize(body, coinNameMap);
  return (
    <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-gc-fg">
      {tokens.map((t, i) => {
        if (t.type === "text") return <span key={i}>{t.value}</span>;
        if (t.type === "ticker") {
          return (
            <TickerHoverCard
              key={i}
              symbol={t.symbol}
              initialData={tickerPreviewMap?.[t.symbol]}>
              <Link
                href={`/coins/${t.symbol.toLowerCase()}`}
                prefetch={false}
                className={LINK_CLASS}>
                {t.display}
              </Link>
            </TickerHoverCard>
          );
        }
        if (t.type === "mention") {
          return (
            <Link key={i} href={`/profile/${t.username}`} className={LINK_CLASS}>
              @{t.username}
            </Link>
          );
        }
        return (
          <a
            key={i}
            href={t.href}
            target="_blank"
            rel="noopener noreferrer"
            className={LINK_CLASS}>
            {t.display}
          </a>
        );
      })}
    </p>
  );
}
