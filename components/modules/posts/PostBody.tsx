// components/modules/posts/PostBody.tsx
//
// Rendering del body di un post con auto-link di `$TICKER`, `@user` e
// URL nudi. Plain-text in, JSX out — niente markdown.
//
// Performance: presentational pure, nessun fetch. Le regex sono
// compilate a module-load. Per body 2000 char il costo è ~µs.
//
// Pattern allineato con lib/modules/posts/lib/parsing.ts (le regex
// matchano cose accettate da extractTickers/extractMentions, così
// quello che parsiamo lato UI è esattamente ciò che è stato salvato
// in posts_tickers/posts_mentions).
import Link from "next/link";
import type { JSX } from "react";

const TOKEN_REGEX =
  /(?<ticker>\$[A-Z][A-Z0-9]{1,19}\b)|(?<mention>@[A-Za-z][A-Za-z0-9_]{2,29}\b)|(?<url>https?:\/\/[^\s<>]+)/g;

type Token =
  | { type: "text"; value: string }
  | { type: "ticker"; symbol: string }
  | { type: "mention"; username: string }
  | { type: "url"; href: string; display: string };

function tokenize(body: string): Token[] {
  const out: Token[] = [];
  let lastIndex = 0;
  TOKEN_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  // eslint-disable-next-line no-cond-assign
  while ((match = TOKEN_REGEX.exec(body)) !== null) {
    if (match.index > lastIndex) {
      out.push({ type: "text", value: body.slice(lastIndex, match.index) });
    }
    if (match.groups?.ticker) {
      out.push({ type: "ticker", symbol: match.groups.ticker.slice(1) });
    } else if (match.groups?.mention) {
      out.push({ type: "mention", username: match.groups.mention.slice(1) });
    } else if (match.groups?.url) {
      const href = match.groups.url;
      const display = href.length > 60 ? href.slice(0, 57) + "…" : href;
      out.push({ type: "url", href, display });
    }
    lastIndex = TOKEN_REGEX.lastIndex;
  }
  if (lastIndex < body.length) {
    out.push({ type: "text", value: body.slice(lastIndex) });
  }
  return out;
}

const LINK_CLASS =
  "text-gc-accent hover:underline underline-offset-2 decoration-gc-accent/60";

export function PostBody({ body }: { body: string }): JSX.Element {
  const tokens = tokenize(body);
  return (
    <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-gc-fg">
      {tokens.map((t, i) => {
        if (t.type === "text") return <span key={i}>{t.value}</span>;
        if (t.type === "ticker") {
          return (
            <Link key={i} href={`/explore?ticker=${t.symbol}`} className={LINK_CLASS}>
              ${t.symbol}
            </Link>
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
            className={LINK_CLASS}
          >
            {t.display}
          </a>
        );
      })}
    </p>
  );
}
