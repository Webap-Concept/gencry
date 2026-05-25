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
const WORD_REGEX = /\b[A-Za-z][A-Za-z0-9]{2,}\b/g;

// URL detection — tre formati supportati:
//   1) http(s)://<host>[/path]      → match con protocollo esplicito
//   2) www.<host>[/path]            → senza protocollo (prepend https://)
//   3) <host>[/path] con TLD noto   → "bare" domain (prepend https://)
//
// Per (3) servono almeno 2 segmenti host (es. coingecko.com) e l'ultimo
// deve essere in `COMMON_TLDS` — altrimenti "frase.altra" diventerebbe
// link. La whitelist copre i TLD più diffusi (~80) + parecchi ccTLD;
// TLD esotici (.eth, .crypto, ecc.) richiedono aggiunta manuale.
//
// La regex è volutamente "greedy" sul path (`[^\s<>]*`): inghiotte
// anche eventuale punteggiatura finale (`example.com,`), che viene poi
// tagliata da `stripTrailingPunctuation` e restituita come testo dopo
// il link. Senza questo passaggio, virgole/punti/parentesi finali
// rimanevano dentro l'href e il browser navigava a un URL invalido.
const URL_REGEX =
  /\b(?:https?:\/\/|www\.)?[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)+(?:\/[^\s<>]*)?/g;

const COMMON_TLDS = new Set([
  // generic
  "com","org","net","io","co","dev","app","ai","tech","cloud","info","biz",
  "xyz","online","store","blog","site","website","shop","news","live",
  "stream","video","photo","art","design","studio","work","careers",
  "money","finance","crypto","exchange","trading","wallet","network",
  "global","world","group","systems","services","solutions","digital",
  "agency","media","markets","fund","capital","investments","ventures",
  // gov/edu/mil
  "gov","edu","mil",
  // ccTLD popolari
  "it","fr","de","uk","us","eu","es","pt","nl","pl","ch","at","be","se",
  "no","fi","dk","jp","cn","in","br","mx","ca","au","nz","ie","gr","cz",
  "ro","sk","hu","bg","hr","tr","ru","ua",
  // ccTLD spesso usati per branding
  "to","ly","mn","gg","fm","la","sh","sm","st","gl","ag","ms","im","je",
  "me","tv","cc","so",
]);

const TRAILING_PUNCT_REGEX = /[.,;:!?\]\)\}>'"’”]+$/;

/**
 * Strip trailing punctuation from a captured URL. The stripped chunk is
 * returned separately so the caller can re-emit it as plain text after
 * the link token, preserving the original text shape.
 */
function stripTrailingPunctuation(raw: string): { url: string; trail: string } {
  const m = raw.match(TRAILING_PUNCT_REGEX);
  if (!m) return { url: raw, trail: "" };
  return { url: raw.slice(0, -m[0].length), trail: m[0] };
}

/**
 * Validate + normalize a candidate URL match. Returns null for bare
 * domains whose TLD isn't in the whitelist (avoids false positives on
 * sentences like "frase.altra" or "es.la").
 */
function normalizeUrl(raw: string): { href: string; display: string } | null {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (lower.startsWith("http://") || lower.startsWith("https://")) {
    return { href: raw, display: raw };
  }
  if (lower.startsWith("www.")) {
    return { href: `https://${raw}`, display: raw };
  }
  // Bare domain: validate TLD.
  const hostEnd = raw.indexOf("/");
  const host = hostEnd === -1 ? raw : raw.slice(0, hostEnd);
  const parts = host.split(".");
  const tld = parts[parts.length - 1].toLowerCase();
  if (!COMMON_TLDS.has(tld)) return null;
  return { href: `https://${raw}`, display: raw };
}

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
    // Strip trailing punctuation BEFORE validating, so e.g. `example.com,`
    // is validated as `example.com` and the comma stays as plain text.
    const { url } = stripTrailingPunctuation(m[0]);
    const normalized = normalizeUrl(url);
    if (!normalized) continue;
    const display =
      normalized.display.length > 60
        ? normalized.display.slice(0, 57) + "…"
        : normalized.display;
    out.push({
      start,
      end: start + url.length,
      token: { type: "url", href: normalized.href, display },
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
            <Link key={i} href={`/u/${t.username}`} className={LINK_CLASS}>
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
