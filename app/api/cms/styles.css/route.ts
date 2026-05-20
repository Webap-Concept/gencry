/**
 * GET /api/cms/styles.css
 * Serve il CSS applicato ai contenuti delle pagine CMS (.tpl-content,
 * .cms-figure, blockquote 4 stili). Sorgente:
 *   - DB: app_settings[key='cms.custom_css'].value se l'admin ha
 *     personalizzato gli stili da /admin/content/styles.
 *   - Default seed: lib/cms/default-styles.ts (DEFAULT_CMS_STYLES) se
 *     la chiave non c'è, è null o stringa vuota.
 *
 * Caricamento: il renderer CmsPage emette un <link rel="stylesheet"
 * href="/api/cms/styles.css"> server-side, così il file è incluso solo
 * sulle pagine CMS effettive (non sul layout (cms) che ospita anche
 * footer cookie / 404 / landing).
 *
 * Cache: HTTP `Cache-Control public, max-age=31536000, immutable`. Il
 * caller include sempre `?v=<stylesVersion>` (= updated_at della
 * key cms.custom_css) → quando l'admin salva un nuovo CSS, l'URL
 * cambia di sicuro e CDN/browser fanno cache miss. Quindi possiamo
 * trattare ogni versione come immutabile, eliminando il TTL 5min
 * che Lighthouse segnalava come "inefficient cache lifetime".
 */
import { DEFAULT_CMS_STYLES } from "@/lib/cms/default-styles";
import { db } from "@/lib/db/drizzle";
import { appSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET() {
  let content = DEFAULT_CMS_STYLES;

  try {
    const rows = await db
      .select({ value: appSettings.value })
      .from(appSettings)
      .where(eq(appSettings.key, "cms.custom_css"))
      .limit(1);
    const stored = rows[0]?.value;
    if (stored && stored.trim() !== "") {
      content = stored;
    }
  } catch (err) {
    // DB transitorio → ritorna comunque il default. Le CMS pages
    // continuano a renderizzare con la typography di base.
    console.error("[/api/cms/styles.css] DB error, using default:", err);
  }

  return new NextResponse(content, {
    status: 200,
    headers: {
      "Content-Type": "text/css; charset=utf-8",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
