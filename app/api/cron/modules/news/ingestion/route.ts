// app/api/cron/modules/news/ingestion/route.ts
//
// Cron handler: scrape RSS/Atom feeds da tutte le active sources, dedup,
// insert nuovi items come pending_rewrite. Schedule: ogni 15 minuti.
//
// Idempotente: insertItemIfNew fa ON CONFLICT DO NOTHING su original_hash.
// Una source rotta non blocca le altre (try/catch + markSourceError).
import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/modules/news/cron-auth";
import { getNewsConfig } from "@/lib/modules/news/config";
import { getActiveSources } from "@/lib/modules/news/queries";
import { ingestSource } from "@/lib/modules/news/ingestion";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  return runIngestion();
}

// GET = manual trigger admin (la sicurezza è il CRON_SECRET passato come
// query/header dall'admin "Run now" via server action — il client non vede
// mai il segreto).
export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  return runIngestion();
}

async function runIngestion() {
  const started = Date.now();
  const cfg = await getNewsConfig();
  const sources = await getActiveSources();

  let totalSeen = 0;
  let totalInserted = 0;
  const perSource: Array<{
    id: string;
    name: string;
    fetched: boolean;
    seen: number;
    inserted: number;
    durationMs: number;
    error?: string;
  }> = [];

  for (const source of sources) {
    try {
      const r = await ingestSource(source, cfg.fetchMaxItemsPerSource);
      totalSeen += r.itemsSeen;
      totalInserted += r.itemsInserted;
      perSource.push({
        id: source.id,
        name: source.name,
        fetched: r.fetched,
        seen: r.itemsSeen,
        inserted: r.itemsInserted,
        durationMs: r.durationMs,
      });
    } catch (err) {
      perSource.push({
        id: source.id,
        name: source.name,
        fetched: false,
        seen: 0,
        inserted: 0,
        durationMs: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({
    ok: true,
    sourcesProcessed: sources.length,
    itemsSeen: totalSeen,
    itemsInserted: totalInserted,
    perSource,
    durationMs: Date.now() - started,
  });
}
