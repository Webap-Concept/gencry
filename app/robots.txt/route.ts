/**
 * app/robots.txt/route.ts
 * Genera robots.txt dinamicamente:
 *   - Content base (rules user-agent / Disallow / Allow) → da app_settings,
 *     editabile da Admin → SEO → Robots.
 *   - Righe `Sitemap:` → auto-generate dal core: sitemap CMS principale +
 *     1 per ogni `ModuleManifest.sitemap` dichiarata dai moduli installati.
 *     Eventuali righe `Sitemap:` scritte a mano nel content user vengono
 *     RIMOSSE prima dell'append per evitare duplicati / divergenza.
 */
import { db } from "@/lib/db/drizzle";
import { appSettings } from "@/lib/db/schema";
import { MODULE_SITEMAPS } from "@/lib/modules/sitemap-registry";
import { getSiteUrl } from "@/lib/seo";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

const DEFAULT_ROBOTS_RULES = [
  "User-agent: *",
  "Allow: /",
  "Disallow: /admin/",
  "Disallow: /api/",
].join("\n");

/** Rimuove eventuali righe `Sitemap: ...` dal content user-editable —
 *  le sostituiamo programmaticamente. Preserva ogni altra riga (anche
 *  vuote, anche commenti #). */
function stripSitemapLines(content: string): string {
  return content
    .split(/\r?\n/)
    .filter((line) => !/^\s*sitemap\s*:/i.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
}

export async function GET() {
  let rulesContent = DEFAULT_ROBOTS_RULES;
  let siteUrl = "";

  try {
    const [rows, resolvedSiteUrl] = await Promise.all([
      db
        .select({ value: appSettings.value })
        .from(appSettings)
        .where(eq(appSettings.key, "robots_txt"))
        .limit(1),
      getSiteUrl(),
    ]);
    if (rows[0]?.value) {
      rulesContent = stripSitemapLines(rows[0].value);
    }
    siteUrl = resolvedSiteUrl;
  } catch (err) {
    console.error("[robots.txt] DB error, using defaults:", err);
  }

  // Sitemap principale (core CMS) + 1 per modulo che ne dichiara una
  // via lib/modules/sitemap-registry. Bots leggono multi-line Sitemap
  // senza bisogno di un sitemap index.
  const sitemapLines: string[] = [];
  if (siteUrl) {
    sitemapLines.push(`Sitemap: ${siteUrl}/sitemap.xml`);
    for (const mod of MODULE_SITEMAPS) {
      sitemapLines.push(`Sitemap: ${siteUrl}${mod.url}`);
    }
  }

  const content = [rulesContent, "", ...sitemapLines].join("\n");

  return new NextResponse(content, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      // max-age=60 (era 3600): permette all'admin di vedere gli effetti
      // delle modifiche entro 1 minuto. Il CDN/browser cache HTTP standard
      // NON è invalidata da `revalidatePath` (quello tocca la cache
      // Next.js interna). I bot crawler chiedono robots.txt <1x/giorno —
      // 60s di freshness è ampiamente sufficiente.
      "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
    },
  });
}
