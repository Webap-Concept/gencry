// app/api/cron/security/ip-rules/route.ts
//
// Cron worker per la manutenzione delle IP rules. Due job in uno:
//
//   1. Cleanup: cancella righe scadute da > 30 giorni (retention configurabile).
//      Le righe scadute vengono comunque ignorate dal loader cached
//      (`expires_at <= NOW()`) ma sporcano la dashboard, meglio purgarle.
//
//   2. Flush hit counters: legge `ip-rule:hits:<id>` da Redis (popolati
//      fire-and-forget dai check evaluateIpForAuth/Admin), li somma sui
//      contatori `hit_count` nella tabella, e cancella le chiavi Redis.
//      Frequenza consigliata: ogni 5-15 minuti.
//
// Triggered via HTTP GET con `Authorization: Bearer ${CRON_SECRET}`.
// Idempotente: ri-esecuzione non causa danni (delete è IS NOT NULL filtered,
// flush usa GETDEL atomico).

import { isAuthorizedCron } from "@/lib/modules/prices/cron-auth";
import { redisCmd } from "@/lib/auth/rate-limit-redis";
import {
  deleteExpiredIpRules,
  flushHitCounters,
  listIpRules,
} from "@/lib/db/ip-rules-queries";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const startedAt = Date.now();
  try {
    // 1. Cleanup
    const purged = await deleteExpiredIpRules(30);

    // 2. Flush hit counters. Carica gli ID delle regole attive (poche
    // decine al massimo) e per ognuna fa GETDEL atomico — la chiave
    // sparisce solo se aveva un valore. Niente race con increments
    // concorrenti dopo il GETDEL: arrivano nuovi valori, prossimo flush.
    const rules = await listIpRules({ state: "active" });
    const hits = new Map<number, number>();
    for (const r of rules) {
      try {
        const result = await redisCmd<string | null>([
          "GETDEL",
          `ip-rule:hits:${r.id}`,
        ]);
        if (result) {
          const n = Number(result);
          if (Number.isFinite(n) && n > 0) hits.set(r.id, n);
        }
      } catch {
        // Redis down o chiave assente → skip senza perdere il cron
      }
    }
    if (hits.size > 0) {
      await flushHitCounters(hits);
    }

    // Niente updateTag qui: in Route Handler GET non è disponibile in Next 16,
    // e comunque non serve — la TTL 30s di unstable_cache vede le righe
    // scadute filtrate dal predicato `expires_at IS NULL OR expires_at > NOW()`.

    return NextResponse.json({
      ok: true,
      durationMs: Date.now() - startedAt,
      purged,
      flushedRules: hits.size,
      flushedHits: Array.from(hits.values()).reduce((a, b) => a + b, 0),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[cron/security/ip-rules] failed:", err);
    return NextResponse.json(
      { ok: false, error: message, durationMs: Date.now() - startedAt },
      { status: 500 },
    );
  }
}
