// Cron worker for suspicious-session detection.
//
// Triggered by Supabase pg_cron via HTTP GET with
//   Authorization: Bearer ${CRON_SECRET}
//
// Recommended frequency: every 15 minutes. The runner is idempotent
// (INSERT … ON CONFLICT on dedup_key) so over-triggering is safe; email
// digests are throttled by the configured schedule.
//
// pg_cron schedule example:
//   SELECT cron.schedule(
//     'sessions-suspicious-detection',
//     '*/15 * * * *',
//     $$ SELECT net.http_get(
//          url := 'https://<app>/api/cron/sessions/suspicious',
//          headers := jsonb_build_object(
//            'Authorization', 'Bearer ' || '<CRON_SECRET>'
//          )
//        ); $$
//   );

import { isAuthorizedCron } from "@/lib/modules/prices/cron-auth";
import { runSuspiciousDetection } from "@/lib/sessions/suspicious/runner";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const startedAt = Date.now();
  try {
    const result = await runSuspiciousDetection();
    return NextResponse.json({
      ok: true,
      durationMs: Date.now() - startedAt,
      ...result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[cron/sessions-suspicious] failed:", err);
    return NextResponse.json(
      { ok: false, error: message, durationMs: Date.now() - startedAt },
      { status: 500 },
    );
  }
}
