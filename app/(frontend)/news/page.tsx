// app/(frontend)/news/page.tsx
//
// Listing pubblico /news. Sta in (frontend)/ → eredita il layout
// pubblico fisso (PublicHeader auth-aware + AppRightRail + PublicFooter).
// Stessa "vestita" per loggato e anonimo: cambia solo l'angolo destro
// dell'header (Accedi/Iscriviti vs avatar + "Apri l'app").
//
// Detail page rimane gestita dal catch-all `[...slug]/page.tsx` del CMS.

import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db/drizzle";
import { mediaAssets, pages } from "@/lib/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { getCachedSeoPage } from "@/lib/seo";
import { DEFAULT_LOCALE } from "@/lib/i18n/config";
import { Calendar } from "lucide-react";
import { buildOptimizedImageAttrs } from "@/lib/storage/image-optimizer";
import { IMAGE_PRESETS } from "@/lib/storage/image-widths";

const PAGE_SIZE = 20;

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const seo = await getCachedSeoPage("/news", DEFAULT_LOCALE);
  return {
    title: seo?.title ?? "News",
    description:
      seo?.description ?? "Notizie e analisi crypto curate dalla redazione di GenerazioneCrypto.",
    openGraph: {
      title: seo?.ogTitle ?? seo?.title ?? "News",
      description: seo?.ogDescription ?? seo?.description ?? undefined,
      type: "website",
    },
  };
}

interface NewsCard {
  id: number;
  slug: string;
  title: string;
  publishedAt: Date | null;
  excerpt: string | null;
  heroUrl: string | null;
}

async function getPublishedNews(limit: number, offset: number): Promise<NewsCard[]> {
  const rows = await db
    .select({
      id: pages.id,
      slug: pages.slug,
      title: pages.title,
      publishedAt: pages.publishedAt,
      customFields: pages.customFields,
    })
    .from(pages)
    .where(and(eq(pages.pageType, "news"), eq(pages.status, "published")))
    .orderBy(desc(pages.publishedAt))
    .limit(limit)
    .offset(offset);

  // Risolvi hero asset (custom_fields.hero_image è un asset_id stringa) in
  // un'unica query bulk.
  const heroIds: number[] = [];
  const heroBySlug = new Map<string, { excerpt: string | null; heroId: number | null }>();
  for (const r of rows) {
    let parsed: Record<string, string> = {};
    try {
      parsed = JSON.parse(r.customFields ?? "{}");
    } catch {
      // ignore
    }
    const heroId = parsed.hero_image ? Number(parsed.hero_image) : null;
    if (heroId && Number.isFinite(heroId)) heroIds.push(heroId);
    heroBySlug.set(r.slug, { excerpt: parsed.excerpt ?? null, heroId });
  }

  const heroes =
    heroIds.length > 0
      ? await db
          .select({ id: mediaAssets.id, publicUrl: mediaAssets.publicUrl })
          .from(mediaAssets)
          .where(sql`${mediaAssets.id} IN (${sql.join(heroIds.map((id) => sql`${id}`), sql`, `)})`)
      : [];
  const heroById = new Map(heroes.map((h) => [h.id, h.publicUrl]));

  return rows.map((r) => {
    const extra = heroBySlug.get(r.slug);
    return {
      id: r.id,
      slug: r.slug,
      title: r.title,
      publishedAt: r.publishedAt,
      excerpt: extra?.excerpt ?? null,
      heroUrl: extra?.heroId ? heroById.get(extra.heroId) ?? null : null,
    };
  });
}

export default async function NewsListingPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const pageNum = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const offset = (pageNum - 1) * PAGE_SIZE;

  const news = await getPublishedNews(PAGE_SIZE, offset);

  return (
    <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">News</h1>
        <p className="text-sm text-muted-foreground">
          Notizie e analisi crypto curate dalla redazione di GenerazioneCrypto.
        </p>
      </header>

      {news.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-16">
          Nessun articolo pubblicato per il momento. Torna a trovarci a breve.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {news.map((n) => (
            <NewsCardComponent key={n.id} item={n} />
          ))}
        </div>
      )}

      {news.length === PAGE_SIZE && (
        <div className="flex justify-between pt-6">
          {pageNum > 1 ? (
            <Link
              href={`/news?page=${pageNum - 1}`}
              className="text-sm underline text-muted-foreground hover:text-foreground"
            >
              ← Pagina precedente
            </Link>
          ) : (
            <span />
          )}
          <Link
            href={`/news?page=${pageNum + 1}`}
            className="text-sm underline text-muted-foreground hover:text-foreground"
          >
            Pagina successiva →
          </Link>
        </div>
      )}
    </div>
  );
}

function NewsCardComponent({ item }: { item: NewsCard }) {
  return (
    <Link
      href={`/${item.slug}`}
      className="group block rounded-xl overflow-hidden bg-card border border-border hover:border-primary/40 transition-colors"
    >
      {item.heroUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          {...buildOptimizedImageAttrs(item.heroUrl, IMAGE_PRESETS.cmsHero)}
          alt={item.title}
          className="w-full aspect-[16/9] object-cover"
        />
      ) : (
        <div className="w-full aspect-[16/9] bg-muted" />
      )}
      <div className="p-5 space-y-2">
        <h2 className="text-lg font-semibold leading-snug group-hover:text-primary transition-colors">
          {item.title}
        </h2>
        {item.excerpt && (
          <p className="text-sm text-muted-foreground line-clamp-3">{item.excerpt}</p>
        )}
        {item.publishedAt && (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5 pt-1">
            <Calendar size={12} />
            {new Date(item.publishedAt).toLocaleDateString("it-IT", {
              day: "2-digit",
              month: "long",
              year: "numeric",
            })}
          </p>
        )}
      </div>
    </Link>
  );
}
