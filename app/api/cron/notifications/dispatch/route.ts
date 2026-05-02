import { isAuthorizedCron } from "@/lib/modules/prices/cron-auth";
import { runGenerators } from "@/lib/notifications/dispatcher";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cron worker che riconcilia le notifiche admin (failure cron, secret
 * rotation, ecc.) eseguendo tutti i generatori. Triggered da Supabase
 * pg_cron via HTTP GET con header `Authorization: Bearer ${CRON_SECRET}`.
 *
 * Bypassa il throttle del dispatcher (`runGenerators` invece di
 * `runGeneratorsThrottled`): è il pg_cron stesso a fare da throttle.
 *
 * Frequenza consigliata: 5 minuti — buon compromesso tra freschezza
 * delle notifiche e carico DB. Il layout admin continua a chiamare la
 * versione throttled come fallback nel caso pg_cron sia fermo.
 *
 * pg_cron schedule example:
 *   SELECT cron.schedule(
 *     'notifications-dispatch',
 *     '*\/5 * * * *',
 *     $$ SELECT net.http_get(
 *          url := 'https://<app>/api/cron/notifications/dispatch',
 *          headers := jsonb_build_object('Authorization', 'Bearer ' || '<CRON_SECRET>')
 *        ); $$
 *   );
 */
export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const startedAt = Date.now();
  try {
    await runGenerators();
    return NextResponse.json({
      ok: true,
      durationMs: Date.now() - startedAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[cron/notifications-dispatch] failed:", err);
    return NextResponse.json(
      { ok: false, error: message, durationMs: Date.now() - startedAt },
      { status: 500 },
    );
  }
}
