// lib/modules/news/publish.ts
//
// Bridge CMS: prende un news_item (in stato review o scheduled), crea/aggiorna
// la corrispondente row in `pages` con page_type='news', muove lo stato a
// `published`. Chiamato:
//   - dal cron publisher (per gli scheduled con due)
//   - dalla server action "Publish now" admin dalla review page
//
// Caveat:
//   - Slug pattern: `news/<yyyy-mm-dd>-<slug-from-title>`. Pre-fissato così
//     da escludere collisioni con altre user pages (lo slug `news` resta
//     libero per la listing handcrafted in /app/(cms)/news/page.tsx).
//   - customFields salvati come JSON string (schema pages.custom_fields è
//     text default '{}', il parser CMS lo decodifica con safe try/catch).
//   - Hero asset obbligatorio: se manca, ritorna errore. Validato qui
//     server-side, non nel template DB (che ha required=false per permettere
//     pagine create a mano dall'admin).
import "server-only";

import { marked } from "marked";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import {
  newsItems,
  pageTemplates,
  pages,
  type NewsItem,
} from "@/lib/db/schema";
import { invalidatePageCachesAndSync } from "@/lib/db/pages-queries";
import { upsertSeoPage } from "@/lib/db/seo-queries";
import { listCoins } from "@/lib/modules/prices/queries";
import { slugify } from "@/lib/utils/slugify";
import { autoLinkCoinsInMarkdown } from "./auto-link";

export type PublishOutcome =
  | { ok: true; pageId: number; slug: string }
  | { ok: false; error: string };

/**
 * Lookup id del template CMS "news" (seedato da M_news_002_cms_seed).
 * Memoizzato per process — il template id è stabile dopo il seed.
 */
let cachedNewsTemplateId: number | null = null;
async function getNewsTemplateId(): Promise<number | null> {
  if (cachedNewsTemplateId !== null) return cachedNewsTemplateId;
  const [row] = await db
    .select({ id: pageTemplates.id })
    .from(pageTemplates)
    .where(eq(pageTemplates.slug, "news"))
    .limit(1);
  cachedNewsTemplateId = row?.id ?? null;
  return cachedNewsTemplateId;
}

/**
 * Genera lo slug pubblico della page CMS. Convenzione:
 *   news/<yyyy-mm-dd>-<slug-from-title>
 *
 * Il prefix `news/` resta riservato (la pagina di listing vive su `/news`
 * gestita da un page handler dedicato in app/(cms)/news/page.tsx).
 */
function buildNewsSlug(title: string, publishedAt: Date): string {
  const date = publishedAt.toISOString().slice(0, 10);
  const titlePart = slugify(title).slice(0, 80) || "article";
  return `news/${date}-${titlePart}`;
}

/**
 * Marked configurato per output HTML safe (no raw HTML, no link autolink-ed).
 * L'output va dentro `pages.content` e poi passa per il rendering CMS che fa
 * sanitize via sanitize-html in `cms-page.tsx`. Doppio cinturone OK.
 */
marked.setOptions({ gfm: true, breaks: false });

function markdownToHtml(mdInput: string): string {
  const out = marked.parse(mdInput, { async: false }) as string;
  return out;
}

export interface PublishInput {
  itemId: string;
  /** Hero asset_id richiesto: validato qui. Se l'admin lo ha messo nel
   *  news_items.hero_asset_id va bene; passato esplicito per chiarezza. */
  heroAssetId: number;
}

/**
 * Pubblica un news_item come pagina CMS. Idempotente:
 *   - se item.published_page_id è già settato → UPDATE su quella page
 *     (consente "re-publish" / "re-process" dell'item)
 *   - sennò INSERT nuova page + scrive published_page_id
 */
export async function publishNewsItem(input: PublishInput): Promise<PublishOutcome> {
  const [item] = await db
    .select()
    .from(newsItems)
    .where(eq(newsItems.id, input.itemId))
    .limit(1);

  if (!item) return { ok: false, error: "item_not_found" };
  if (item.status === "rejected") return { ok: false, error: "item_rejected" };
  if (!item.generatedTitleIt || !item.generatedBodyItMd) {
    return { ok: false, error: "item_not_rewritten" };
  }
  if (!input.heroAssetId) {
    return { ok: false, error: "hero_image_required" };
  }

  const templateId = await getNewsTemplateId();
  if (!templateId) {
    return {
      ok: false,
      error:
        "news_template_missing — run M_news_002_cms_seed.sql in Supabase Editor",
    };
  }

  const now = new Date();
  const slug = buildNewsSlug(item.generatedTitleIt, now);

  // Optional: auto-link della PRIMA occorrenza di un coin noto verso
  // /coins/<symbol>. Cap 1 link per articolo. Toggle per-item (checkbox
  // nel review editor) salvato in item.autoLinkCoins. Se false (default),
  // skippa la query coins e converte direttamente in HTML.
  let bodyMd = item.generatedBodyItMd;
  if (item.autoLinkCoins) {
    const coins = await listCoins();
    const result = autoLinkCoinsInMarkdown(
      bodyMd,
      coins.map((c) => ({ name: c.name, symbol: c.symbol })),
    );
    bodyMd = result.md;
  }
  const contentHtml = markdownToHtml(bodyMd);

  const customFields = JSON.stringify({
    hero_image: String(input.heroAssetId),
    excerpt: item.generatedExcerptIt ?? "",
  });

  let pageId: number;

  if (item.publishedPageId) {
    // Re-publish: aggiorna la page esistente.
    const [updated] = await db
      .update(pages)
      .set({
        title: item.generatedTitleIt,
        content: contentHtml,
        status: "published",
        publishedAt: now,
        templateId,
        customFields,
        pageType: "news",
        visibility: "public",
        updatedAt: now,
      })
      .where(eq(pages.id, item.publishedPageId))
      .returning({ id: pages.id });
    pageId = updated.id;
  } else {
    const [inserted] = await db
      .insert(pages)
      .values({
        slug,
        title: item.generatedTitleIt,
        content: contentHtml,
        status: "published",
        publishedAt: now,
        templateId,
        customFields,
        pageType: "news",
        visibility: "public",
        isSystem: false,
        contentEditable: true,
      })
      .returning({ id: pages.id });
    pageId = inserted.id;
  }

  // SEO sidecar (seo_pages keyed by pathname). Constraint sui varchar: title
  // <= 70 e description <= 160 → tronchiamo lato modulo, l'LLM ha già
  // istruzioni per stare nei limiti ma difendiamoci.
  try {
    await upsertSeoPage({
      pathname: `/${slug}`,
      label: `News · ${item.generatedTitleIt.slice(0, 60)}`,
      title: item.generatedTitleIt.slice(0, 70),
      description: (item.generatedExcerptIt ?? "").slice(0, 160),
      ogTitle: item.generatedTitleIt.slice(0, 70),
      ogDescription: (item.generatedExcerptIt ?? "").slice(0, 160),
      ogImage: null,
      robots: null,
      jsonLdEnabled: false,
      jsonLdType: null,
    });
  } catch (err) {
    // SEO sidecar non-blocking: la page è già pubblicata, i meta cadranno
    // sui default dell'app finché qualcuno non li sistema.
    console.error("[news] upsertSeoPage failed for", slug, err);
  }

  // Marca l'item published.
  await db
    .update(newsItems)
    .set({
      status: "published",
      publishedAt: now,
      publishedPageId: pageId,
      heroAssetId: input.heroAssetId,
      updatedAt: now,
    })
    .where(eq(newsItems.id, item.id));

  // Invalida cache pagine CMS (la nuova page deve essere subito visibile
  // sul frontend pubblico).
  await invalidatePageCachesAndSync();

  return { ok: true, pageId, slug };
}
