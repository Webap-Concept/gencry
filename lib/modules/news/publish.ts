// lib/modules/news/publish.ts
//
// Bridge CMS: prende un news_item (in stato review o scheduled), crea/aggiorna
// la corrispondente row in `pages` con page_type='news', muove lo stato a
// `published`. Chiamato:
//   - dal cron publisher (per gli scheduled con due)
//   - dalla server action "Publish now" admin dalla review page
//
// Modello slug (post refactor news-categories-as-cms-pages, mag 2026):
//   - L'articolo è una page CMS figlia della page categoria. La page
//     categoria (es. `news/bitcoin`, `news/mercati`) esiste come row in
//     `pages` con template `news-category`, parent /news. Lo slug
//     dell'articolo è composto come `<parent.slug>/<leaf>` esattamente
//     come fa il page-editor admin client-side — la fonte di verità per
//     il prefix categoria è il DB (pages.slug), non più la mappa
//     hardcoded di `url-prefixes.ts`. Quella mappa resta solo per
//     risolvere `news_items.category` → categoria-page-slug nel lookup
//     iniziale.
//   - Articoli con category='other'/NULL → parent = page /news (home),
//     slug `news/<leaf>` (senza segmento categoria intermedio).
//
// Caveat:
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
import { newsCategoryUrlPrefix } from "./url-prefixes";

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

// Categoria → URL prefix: la mappa vive in `./url-prefixes.ts` ed è usata
// SOLO per risolvere `news_items.category` → slug della categoria-page
// (`news/<prefix>`) nel lookup. La fonte di verità per i path categoria
// resta `pages.slug` nel DB — la mappa è il "ponte" tra l'enum
// editoriale `news_items.category` e la page CMS corrispondente.

/**
 * Trova (o crea on-the-fly se assente) la page CMS categoria sotto cui
 * l'articolo deve essere agganciato. Ritorna { pageId, slug } da usare
 * come parent dell'articolo + prefix per comporre lo slug articolo.
 *
 * Casi:
 *   - category='other' o NULL → parent = page /news (la home blog).
 *     Slug articolo finale: `news/<leaf>`.
 *   - altri → cerca `pages WHERE slug = 'news/<prefix>'`. Se trovata
 *     (caso normale post-migration M_news_007), usa quella. Se NON
 *     trovata (caso degenerato, es. admin ha cancellato la categoria
 *     dal DB) → la crea on-the-fly con template `news-category`,
 *     parent /news, status 'published'. Bypassa la server action RBAC
 *     `upsertPageAction` perché siamo in contesto cron non-authed.
 */
async function getOrCreateCategoryPage(
  category: string | null,
): Promise<{ pageId: number; slug: string } | { error: string }> {
  const prefix = newsCategoryUrlPrefix(category);

  // Home page /news — esiste sempre post-migration (è anche l'home blog).
  const [home] = await db
    .select({ id: pages.id, slug: pages.slug })
    .from(pages)
    .where(eq(pages.slug, "news"))
    .limit(1);
  if (!home) {
    return {
      error:
        "news_home_page_missing — run M_news_007_categories_as_pages.sql in Supabase Editor",
    };
  }

  // other/NULL → parent diretto = home.
  if (prefix === "news") {
    return { pageId: home.id, slug: home.slug };
  }

  const categorySlug = `news/${prefix}`;
  const [existing] = await db
    .select({ id: pages.id, slug: pages.slug })
    .from(pages)
    .where(eq(pages.slug, categorySlug))
    .limit(1);
  if (existing) return { pageId: existing.id, slug: existing.slug };

  // Creazione on-the-fly (degenerato): seedare la categoria mancante.
  const [tplRow] = await db
    .select({ id: pageTemplates.id })
    .from(pageTemplates)
    .where(eq(pageTemplates.slug, "news-category"))
    .limit(1);
  if (!tplRow) {
    return {
      error:
        "news_category_template_missing — run M_news_007_categories_as_pages.sql in Supabase Editor",
    };
  }
  const now = new Date();
  const title = prefix.charAt(0).toUpperCase() + prefix.slice(1);
  const [inserted] = await db
    .insert(pages)
    .values({
      slug: categorySlug,
      title,
      content: "",
      status: "published",
      publishedAt: now,
      parentId: home.id,
      templateId: tplRow.id,
      pageType: "page",
      visibility: "public",
      isSystem: false,
      contentEditable: true,
    })
    .returning({ id: pages.id, slug: pages.slug });
  return { pageId: inserted.id, slug: inserted.slug };
}

/**
 * Compone il leaf slug dell'articolo a partire dal titolo. Le parole con
 * length<3 (e, le, il, i, a, di, da, in, su, al, …) sono droppate per
 * evitare URL gonfiate da stopword e migliorare keyword density. Cap 80
 * char come prima del refactor.
 *
 * NB: non più "slug completo" — è solo il LAST segment. Lo slug pubblico
 * finale è composto in `publishNewsItem` come `<parentSlug>/<leaf>`.
 */
function buildArticleLeafSlug(title: string): string {
  const slugged = slugify(title);
  const meaningful = slugged
    .split("-")
    .filter((w) => w.length >= 3)
    .join("-")
    .slice(0, 80);
  return meaningful || "article";
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

  // Lookup (o creazione) della category page sotto cui agganciare l'articolo.
  // Slug articolo = `<categoryPage.slug>/<leafSlug>` — stessa composizione
  // del page-editor admin client-side ([page-editor.tsx:1051]).
  // NB: per re-publish (item.publishedPageId già settato) NON ricalcoliamo
  // né slug né parent — restano snapshot al primo publish per evitare link
  // rot, come prima del refactor.
  const categoryLookup = await getOrCreateCategoryPage(item.category);
  if ("error" in categoryLookup) {
    return { ok: false, error: categoryLookup.error };
  }
  const leaf = buildArticleLeafSlug(item.generatedTitleIt);
  const slug = `${categoryLookup.slug}/${leaf}`;
  const parentPageId = categoryLookup.pageId;

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

  // Snapshot della categoria nei customFields: per articoli creati a mano
  // dall'editor pages, la categoria vive solo qui; per articoli dal modulo,
  // duplica news_items.category così il TemplateNews ha sempre accesso
  // alla categoria anche se in futuro perdiamo il link news_items.
  const customFields = JSON.stringify({
    hero_image: String(input.heroAssetId),
    excerpt: item.generatedExcerptIt ?? "",
    category: item.category ?? "",
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
        parentId: parentPageId,
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
