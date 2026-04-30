/**
 * app/robots.txt/route.ts
 * Genera robots.txt dinamicamente leggendo il contenuto da app_settings.
 * Modificabile da Admin → SEO → Robots.
 */
import { db } from "@/lib/db/drizzle";
import { appSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://librolo.it";

const DEFAULT_ROBOTS = [
  "User-agent: *",
  "Allow: /",
  "Disallow: /admin/",
  "Disallow: /api/",
  "",
  `Sitemap: ${SITE_URL}/sitemap.xml`,
].join("\n");

export async function GET() {
  let content = DEFAULT_ROBOTS;

  try {
    const rows = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, "robots_txt"))
      .limit(1);
    if (rows[0]?.value) {
      content = rows[0].value;
    }
  } catch (err) {
    console.error("[robots.txt] DB error, using default:", err);
  }

  return new NextResponse(content, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=60",
    },
  });
}
