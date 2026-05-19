// app/api/cron/modules/news/rewrite/route.ts
//
// Cron handler: prende un batch di items pending_rewrite, fetcha il body
// dell'articolo dalla source URL, chiama Claude per il rewrite IT, salva
// l'output e muove lo stato a `review`.
//
// Schedule: ogni 5 minuti. Concorrenza: SKIP LOCKED sul pickup
// (vedi pickPendingRewriteBatch).
//
// Errori:
//   - transient (rate limit, 5xx, network) → status resta pending_rewrite,
//     ai_attempt_count incrementato (lo fa già pickPendingRewriteBatch).
//     Quando ai_attempt_count >= rewrite_max_attempts → marca failed.
//   - permanent (parse fail, schema validation, body too short) → marca
//     failed immediatamente, niente retry.
import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/modules/news/cron-auth";
import { getNewsConfig } from "@/lib/modules/news/config";
import {
  pickPendingRewriteBatch,
  updateItem,
} from "@/lib/modules/news/queries";
import { fetchArticleBody } from "@/lib/modules/news/ingestion";
import { rewriteArticleToItalian } from "@/lib/modules/news/rewriter";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Rewrite può durare ~30s per item × batchSize. Lasciamo margine generoso.
export const maxDuration = 300;

export async function POST(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  return runRewrite();
}

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  return runRewrite();
}

async function runRewrite() {
  const started = Date.now();
  const cfg = await getNewsConfig();

  if (!cfg.anthropicApiKey) {
    return NextResponse.json({
      ok: false,
      skipped: "anthropic_api_key_missing",
      hint: "Configure modules.news.anthropic_api_key in /admin/modules/news/settings",
    });
  }

  const items = await pickPendingRewriteBatch(cfg.rewriteBatchSize);

  const results: Array<{
    id: string;
    status: "review" | "failed" | "retry" | "no_body";
    error?: string;
    costCents?: number;
  }> = [];

  let totalCostCents = 0;

  for (const item of items) {
    try {
      // 1. Fetch del body completo dall'URL della fonte. Se fallisce
      //    (403 bot detection, 404, timeout, network), fallback al
      //    source_excerpt RSS prima di scartare l'item.
      const fetched = await fetchArticleBody(item.sourceUrl);
      const fetchDetail = fetched.ok
        ? null
        : fetched.reason === "http"
        ? `fetch HTTP ${fetched.status}`
        : fetched.reason === "timeout"
        ? "fetch timeout"
        : `fetch network: ${fetched.message.slice(0, 200)}`;

      const bodyForRewrite =
        (fetched.ok ? fetched.html : null) ?? item.sourceExcerpt ?? "";

      if (!bodyForRewrite || bodyForRewrite.length < 200) {
        // Body troppo corto: non possiamo rewriteare un articolo da niente.
        // Se siamo entro retry attempts, lascia pending; sennò failed.
        const detail =
          fetchDetail
            ? `${fetchDetail}; excerpt ${item.sourceExcerpt?.length ?? 0} chars`
            : `body too short (${bodyForRewrite.length} chars)`;
        if (item.aiAttemptCount >= cfg.rewriteMaxAttempts) {
          await updateItem(item.id, {
            status: "failed",
            aiLastError: `Max attempts reached: ${detail}`,
          });
          results.push({ id: item.id, status: "failed", error: `no_body: ${detail}` });
        } else {
          // ai_attempt_count è già stato bumped da pickPendingRewriteBatch.
          // Status resta pending_rewrite per retry al prossimo cron.
          await updateItem(item.id, {
            aiLastError: `Will retry: ${detail}`,
          });
          results.push({ id: item.id, status: "no_body", error: detail });
        }
        continue;
      }

      // 2. Rewrite con Claude.
      const r = await rewriteArticleToItalian({
        sourceTitle: item.sourceTitle,
        sourceBody: bodyForRewrite,
        sourceUrl: item.sourceUrl,
        model: cfg.aiModel,
        apiKey: cfg.anthropicApiKey,
        // Override admin (null/empty = default hardcoded). Tracking via
        // ai_prompt_version: "v1-2026-05-19" se default, "custom-<hash>" se override.
        systemPrompt: cfg.systemPrompt,
      });

      if (r.ok) {
        await updateItem(item.id, {
          status: "review",
          generatedTitleIt: r.output.title,
          generatedBodyItMd: r.output.body_md,
          generatedExcerptIt: r.output.excerpt,
          category: r.output.category,
          aiModel: r.model,
          aiPromptVersion: r.promptVersion,
          aiCostCents: (item.aiCostCents ?? 0) + r.costCents,
          aiLastError: null,
        });
        totalCostCents += r.costCents;
        results.push({ id: item.id, status: "review", costCents: r.costCents });
        continue;
      }

      // Errore: decidi retry o fail.
      const isLastAttempt = item.aiAttemptCount >= cfg.rewriteMaxAttempts;
      const isPermanent = r.kind === "permanent";

      if (isPermanent || isLastAttempt) {
        await updateItem(item.id, {
          status: "failed",
          aiLastError: r.error.slice(0, 2000),
        });
        results.push({ id: item.id, status: "failed", error: r.error });
      } else {
        // Resta pending_rewrite per il prossimo cron run.
        await updateItem(item.id, {
          aiLastError: r.error.slice(0, 2000),
        });
        results.push({ id: item.id, status: "retry", error: r.error });
      }
    } catch (err) {
      // Errore inatteso (es. DB fail). Marca con aiLastError, lascia che il
      // prossimo cron riprovi (fino al limit).
      const msg = err instanceof Error ? err.message : String(err);
      await updateItem(item.id, { aiLastError: msg.slice(0, 2000) });
      results.push({ id: item.id, status: "retry", error: msg });
    }
  }

  return NextResponse.json({
    ok: true,
    batchSize: items.length,
    totalCostCents,
    results,
    durationMs: Date.now() - started,
  });
}
