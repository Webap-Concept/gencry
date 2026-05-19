// app/api/cron/modules/news/publisher/route.ts
//
// Cron handler: pubblica gli items scheduled con scheduled_publish_at <= NOW().
// Schedule: ogni 15 minuti.
//
// Per ogni item:
//   - Validate hero_asset_id presente (publish non parte senza hero).
//   - Chiama publishNewsItem (bridge CMS) → crea/aggiorna pages row +
//     marca item published.
//   - Se manca hero o pubblicazione fallisce → ritorna stato error nel
//     report, item resta scheduled (admin verifica nella queue).
//
// Concorrenza: pickDuePublishingBatch fa FOR UPDATE SKIP LOCKED, niente
// double-publish.
import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/modules/news/cron-auth";
import { getNewsConfig } from "@/lib/modules/news/config";
import { pickDuePublishingBatch } from "@/lib/modules/news/queries";
import { publishNewsItem } from "@/lib/modules/news/publish";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  return runPublisher();
}

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  return runPublisher();
}

async function runPublisher() {
  const started = Date.now();
  const cfg = await getNewsConfig();

  const items = await pickDuePublishingBatch(cfg.publisherBatchSize);

  const results: Array<{
    id: string;
    status: "published" | "skipped" | "error";
    pageId?: number;
    slug?: string;
    error?: string;
  }> = [];

  for (const item of items) {
    if (!item.heroAssetId) {
      results.push({
        id: item.id,
        status: "skipped",
        error: "hero_image_missing",
      });
      continue;
    }

    try {
      const r = await publishNewsItem({
        itemId: item.id,
        heroAssetId: item.heroAssetId,
      });
      if (r.ok) {
        results.push({ id: item.id, status: "published", pageId: r.pageId, slug: r.slug });
      } else {
        results.push({ id: item.id, status: "error", error: r.error });
      }
    } catch (err) {
      results.push({
        id: item.id,
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({
    ok: true,
    batchSize: items.length,
    published: results.filter((r) => r.status === "published").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    errors: results.filter((r) => r.status === "error").length,
    results,
    durationMs: Date.now() - started,
  });
}
