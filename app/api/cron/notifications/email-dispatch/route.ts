// app/api/cron/notifications/email-dispatch/route.ts
//
// Cron route per il dispatcher email generico. Chiamato da pg_cron via
// pg_net ogni 5min. Itera tutte le source registrate (sessions, cron,
// future), rispetta lo schedule per source, raggruppa le admin
// _notifications pending, renderizza il template type-specific e
// invia. Mark email_sent_at su admin_notifications.
//
// pg_cron schedule example:
//   SELECT cron.schedule(
//     'notifications-email-dispatch',
//     '*/5 * * * *',
//     $$ SELECT net.http_get(
//          url := '<APP_URL>/api/cron/notifications/email-dispatch',
//          headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>')
//        ); $$
//   );
import { isAuthorizedCron } from "@/lib/modules/prices/cron-auth";
import { runEmailDispatch } from "@/lib/notifications/email-channel/dispatcher";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runEmailDispatch();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
