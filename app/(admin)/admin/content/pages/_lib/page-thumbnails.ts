import { db } from "@/lib/db/drizzle";
import { mediaAssets, type Page, type PageTemplate, type TemplateField } from "@/lib/db/schema";
import { buildOptimizedImageAttrs } from "@/lib/storage/image-optimizer";
import { IMAGE_PRESETS } from "@/lib/storage/image-widths";
import { inArray } from "drizzle-orm";

const MAX_THUMBS_PER_PAGE = 2;

export interface PageThumb {
  src: string;
  srcSet: string;
  sizes: string;
  alt: string;
}

type TemplateWithFields = PageTemplate & { fields: TemplateField[] };

/**
 * Estrae fino a 2 mini-thumbnails per ogni pagina, da:
 *   1) custom field con `fieldType === "image"` (valore = asset id numerico
 *      oppure URL legacy/esterno)
 *   2) primi `<img src="...">` nel content HTML del body
 *
 * Restituisce una mappa `Map<pageId, PageThumb[]>`. Le pagine senza
 * immagini non compaiono nella mappa.
 *
 * Una sola query DB batch su `media_assets` per risolvere tutti gli
 * asset id collezionati cross-pagina.
 */
export async function buildPageThumbnails(
  pgs: Page[],
  templates: TemplateWithFields[],
): Promise<Record<number, PageThumb[]>> {
  // Step 1: per ogni pagina raccoglie i "raw refs" candidati (asset id o URL),
  // mantenendo l'ordine di apparizione. Estraiamo fino a 4 candidati per pagina
  // per avere margine in caso di asset orfani; tagliamo a MAX dopo la risoluzione.
  type RawRef = { kind: "asset"; id: number; alt?: string } | { kind: "url"; url: string; alt?: string };
  const refsByPage = new Map<number, RawRef[]>();
  const allAssetIds = new Set<number>();

  for (const page of pgs) {
    const refs: RawRef[] = [];

    // 1a) custom fields (fieldType "image")
    const tpl = page.templateId
      ? templates.find((t) => t.id === page.templateId)
      : undefined;
    const imageFieldKeys = (tpl?.fields ?? [])
      .filter((f) => f.fieldType === "image")
      .map((f) => f.fieldKey);

    if (imageFieldKeys.length > 0) {
      let custom: Record<string, unknown> = {};
      try {
        custom = JSON.parse(page.customFields ?? "{}");
      } catch {
        custom = {};
      }
      for (const key of imageFieldKeys) {
        const raw = custom[key];
        if (typeof raw !== "string" || !raw.trim()) continue;
        const trimmed = raw.trim();
        const n = Number(trimmed);
        if (Number.isInteger(n) && n > 0 && String(n) === trimmed) {
          refs.push({ kind: "asset", id: n });
          allAssetIds.add(n);
        } else {
          refs.push({ kind: "url", url: trimmed });
        }
        if (refs.length >= MAX_THUMBS_PER_PAGE * 2) break;
      }
    }

    // 1b) <img src="..."> nel body HTML
    if (refs.length < MAX_THUMBS_PER_PAGE * 2 && page.content) {
      const re = /<img\b[^>]*?\bsrc=["']([^"']+)["'][^>]*?(?:\balt=["']([^"']*)["'])?/gi;
      let match: RegExpExecArray | null;
      while ((match = re.exec(page.content)) !== null) {
        const src = match[1]?.trim();
        if (!src) continue;
        refs.push({ kind: "url", url: src, alt: match[2] });
        if (refs.length >= MAX_THUMBS_PER_PAGE * 2) break;
      }
    }

    if (refs.length > 0) refsByPage.set(page.id, refs);
  }

  // Step 2: batch fetch dei publicUrl per gli asset id
  const assetById = new Map<number, { publicUrl: string; alt: string }>();
  if (allAssetIds.size > 0) {
    const rows = await db
      .select({
        id: mediaAssets.id,
        publicUrl: mediaAssets.publicUrl,
        altText: mediaAssets.altText,
        filename: mediaAssets.filename,
      })
      .from(mediaAssets)
      .where(inArray(mediaAssets.id, Array.from(allAssetIds)));
    for (const r of rows) {
      assetById.set(r.id, {
        publicUrl: r.publicUrl,
        alt: r.altText ?? r.filename ?? "",
      });
    }
  }

  // Step 3: risolvi i refs in PageThumb[], scartando asset orfani e capping a MAX
  const preset = IMAGE_PRESETS.adminTreeThumb;
  const out: Record<number, PageThumb[]> = {};
  for (const [pageId, refs] of refsByPage) {
    const thumbs: PageThumb[] = [];
    for (const ref of refs) {
      let publicUrl: string | null = null;
      let alt = ref.alt ?? "";
      if (ref.kind === "asset") {
        const a = assetById.get(ref.id);
        if (!a) continue;
        publicUrl = a.publicUrl;
        if (!alt) alt = a.alt;
      } else {
        publicUrl = ref.url;
      }
      if (!publicUrl) continue;
      const attrs = buildOptimizedImageAttrs(publicUrl, preset);
      thumbs.push({ ...attrs, alt });
      if (thumbs.length >= MAX_THUMBS_PER_PAGE) break;
    }
    if (thumbs.length > 0) out[pageId] = thumbs;
  }

  return out;
}
