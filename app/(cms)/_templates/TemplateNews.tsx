// app/(cms)/_templates/TemplateNews.tsx
//
// Template del singolo articolo blog (page_type='news'). Auto-discovered
// dal loader via il slug "news" del template DB (seedato in M_news_002).
//
// Layout fedele al design fornito 2026-05-19:
//   [eyebrow pill: — CATEGORIA · NOME-COIN-O-FONTE]
//   [titolo display]
//   [lead serif (excerpt)]
//   [hr]
//   [author avatar + name | meta row: PUBBLICATO + LETTURA + DIFFICOLTÀ]
//   [hr]
//   [hero image full-bleed con caption opzionale]
//   [body HTML con dropcap sulla prima frase]
//
// Author / Difficoltà sono V1 hardcoded (non c'è schema ancora). Reading
// time è calcolato runtime dal body text (200 wpm standard).

import { getNewsMetadataByPageId } from "@/lib/cms/news-feed-queries";
import {
  getMediaSrcset,
  pickMediaVariantUrl,
} from "@/lib/storage/media-asset-processor";
import type { TemplateProps } from "./types";
// Riusa i token + le classi `.news-article-*` definite per il blog.
import "./news/news.css";

const WORDS_PER_MINUTE = 200;

function estimateReadingMinutes(html: string): number {
  // Strip HTML grezzo, conta parole, divide per wpm. Min 1 minuto.
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = text.length === 0 ? 0 : text.split(/\s+/).length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

function formatItDateUpper(d: Date): string {
  // "10 MAG 2026" — short month, all caps.
  return d
    .toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" })
    .replace(/\./g, "")
    .toUpperCase();
}

const AUTHOR_NAME = "Redazione";
const AUTHOR_ROLE = "GenerazioneCrypto";

export async function TemplateNews({ page, fields }: TemplateProps) {
  // `fields.hero_image` è già stato risolto da resolveMediaFields (URL R2
  // pubblico). `fields.excerpt` è la stringa salvata dal modulo news.
  const heroUrl = fields.hero_image || null;
  const excerpt = fields.excerpt || null;

  // Priorità categoria (post refactor news-categories-as-cms-pages):
  //   1. parent.slug (es. "news/bitcoin" → "bitcoin") — fonte autoritativa
  //      del modello CMS gerarchico, in sync con l'URL pubblico.
  //   2. news_items.category — fallback per articoli pre-migration o
  //      con parent_id non valorizzato (caso degenerato).
  //   3. customFields.category — fallback storico per articoli pubblicati
  //      prima del refactor che hanno lo snapshot nei custom fields.
  //   4. "news" — ultima fallback.
  const metadata = await getNewsMetadataByPageId(page.id);
  const categoryFromParent =
    metadata?.parentSlug?.startsWith("news/")
      ? metadata.parentSlug.slice("news/".length)
      : null;
  const category =
    categoryFromParent ||
    metadata?.category ||
    (fields.category && fields.category.trim()) ||
    "news";

  const publishedAt = page.publishedAt ?? page.updatedAt;
  const dateLabel = publishedAt ? formatItDateUpper(new Date(publishedAt)) : "—";
  const readingMin = estimateReadingMinutes(page.content ?? "");

  return (
    <article className="news-article-wrap">
      <div className="news-container news-article">
        {/* EYEBROW pill */}
        <div className="news-article-eyebrow">
          <span>—</span>
          <span className="news-article-eyebrow-cat">{category}</span>
        </div>

        {/* TITLE display */}
        <h1 className="news-article-title">{page.title}</h1>

        {/* LEAD (excerpt) */}
        {excerpt && <p className="news-article-lead">{excerpt}</p>}

        <hr className="news-article-hr" />

        {/* AUTHOR + META row */}
        <div className="news-article-byline">
          <div className="news-article-author">
            <span className="news-article-avatar">
              {AUTHOR_NAME.slice(0, 1)}
            </span>
            <div className="news-article-author-meta">
              <div className="news-article-author-name">{AUTHOR_NAME}</div>
              <div className="news-article-author-role">{AUTHOR_ROLE}</div>
            </div>
          </div>
          <div className="news-article-meta">
            <span>
              <span className="news-article-meta-key">Pubblicato</span>{" "}
              <strong>{dateLabel}</strong>
            </span>
            <span>
              <span className="news-article-meta-key">Lettura</span>{" "}
              <strong>{readingMin} min</strong>
            </span>
          </div>
        </div>

        <hr className="news-article-hr" />

        {/* HERO image full-bleed — usa la variante webp se l'asset è
            stato processato (vedi lib/modules/news/services/hero-processor.ts).
            Fallback all'URL originale per articoli pre-processing. */}
        {heroUrl && (
          <figure className="news-article-hero">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={pickMediaVariantUrl(metadata?.heroVariants, heroUrl, "hero")}
              srcSet={getMediaSrcset(metadata?.heroVariants)}
              // Article body: full viewport sotto 700px (mobile/tablet
              // verticale), max ~1024px sopra (la news-container è larga
              // ~1024 dentro l'article wrap). Browser sceglie card 800w
              // su mobile, hero 1600w su retina desktop.
              sizes="(max-width: 700px) 100vw, 1024px"
              alt={page.title}
              loading="eager"
              fetchPriority="high"
            />
          </figure>
        )}

        {/* BODY con dropcap sulla prima lettera del primo paragrafo */}
        <div
          className="news-article-body tpl-content"
          dangerouslySetInnerHTML={{ __html: page.content }}
        />
      </div>
    </article>
  );
}
