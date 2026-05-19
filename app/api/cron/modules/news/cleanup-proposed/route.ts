// app/api/cron/modules/news/cleanup-proposed/route.ts
//
// Cron handler: auto-reject dei proposed più vecchi di
// modules.news.proposed_retention_days. Schedule: daily.
//
// Niente LLM, niente R2 — è una pura UPDATE batch su DB.
import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/modules/news/cron-auth";
import { getNewsConfig } from "@/lib/modules/news/config";
import { autoRejectProposedOlderThan } from "@/lib/modules/news/queries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  return runCleanup();
}

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  return runCleanup();
}

async function runCleanup() {
  const started = Date.now();
  const cfg = await getNewsConfig();
  const cutoff = new Date(Date.now() - cfg.proposedRetentionDays * 24 * 60 * 60 * 1000);
  const rejected = await autoRejectProposedOlderThan(cutoff);
  return NextResponse.json({
    ok: true,
    retentionDays: cfg.proposedRetentionDays,
    cutoff: cutoff.toISOString(),
    rejected,
    durationMs: Date.now() - started,
  });
}
