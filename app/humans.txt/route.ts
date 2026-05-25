/**
 * app/humans.txt/route.ts
 * Genera humans.txt dinamicamente leggendo il contenuto da app_settings.
 * Modificabile da Admin → SEO → Robots.
 */
import { db } from "@/lib/db/drizzle";
import { appSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

const DEFAULT_HUMANS = [
  "/* TEAM */",
  "Project: Librolo",
  "",
  "/* TECHNOLOGY COLOPHON */",
  "Framework: Next.js (App Router)",
  "Database: PostgreSQL via Supabase",
  "ORM: Drizzle ORM",
  "Auth: Custom JWT (jose)",
  "Email: Resend",
  "Payments: Stripe",
  "Language: TypeScript",
].join("\n");

export async function GET() {
  let content = DEFAULT_HUMANS;

  try {
    const rows = await db
      .select({ value: appSettings.value })
      .from(appSettings)
      .where(eq(appSettings.key, "humans_txt"))
      .limit(1);
    if (rows[0]?.value) {
      content = rows[0].value;
    }
  } catch (err) {
    console.error("[humans.txt] DB error, using default:", err);
  }

  return new NextResponse(content, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      // max-age=60 (era 3600): permette all'admin di vedere gli effetti
      // delle modifiche entro 1 minuto (vedi /robots.txt route per il
      // razionale completo).
      "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
    },
  });
}
