// app/api/cron/modules/notifications/retention-cleanup/route.ts
//
// Cron route per il cleanup retention della tabella `notifications`.
// Chiamato da pg_cron via pg_net 1 volta al giorno (suggerito 04:30 UTC).
//
// pg_cron schedule example:
//   SELECT cron.schedule(
//     'modules-notifications-retention-cleanup',
//     '30 4 * * *',
//     $$ SELECT net.http_get(
//          url := '<APP_URL>/api/cron/modules/notifications/retention-cleanup',
//          headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>')
//        ); $$
//   );
import { isAuthorizedCron } from "@/lib/modules/notifications/cron-auth";
import { runNotificationsRetentionCleanup } from "@/lib/modules/notifications/cron/retention-cleanup";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runNotificationsRetentionCleanup();
    return NextResponse.json(result, {
      status: result.ok ? 200 : 500,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[cron/notifications-retention-cleanup] failed:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
