import { isAuthorizedCron } from "@/lib/modules/prices/cron-auth";
import { runGdprExportCron } from "@/lib/account/gdpr-export";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cron worker per gli export GDPR. Triggered da Supabase pg_cron via HTTP
 * GET con header `Authorization: Bearer ${CRON_SECRET}`. Una singola
 * chiamata processa fino a 5 job pending e fa il cleanup dei file
 * scaduti (expires_at < now()). Frequenza consigliata: 1-5 minuti.
 *
 * pg_cron schedule example:
 *   SELECT cron.schedule(
 *     'gdpr-export-worker',
 *     '* * * * *',
 *     $$ SELECT net.http_get(
 *          url := 'https://<app>/api/cron/account/gdpr-export',
 *          headers := jsonb_build_object('Authorization', 'Bearer ' || '<CRON_SECRET>')
 *        ); $$
 *   );
 */
export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runGdprExportCron();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[cron/gdpr-export] failed:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
