import { isAuthorizedCron } from "@/lib/modules/prices/cron-auth";
import { purgeStaleConsentRecords } from "@/lib/account/consent-ledger";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cron worker per il cleanup retention di `consent_records`. Triggered da
 * Supabase pg_cron via HTTP GET con header `Authorization: Bearer ${CRON_SECRET}`.
 *
 * Cancella in batch tutte le righe più vecchie del retention configurato
 * (`gdpr.consent_log.retention_after_deletion_days`, default 5 anni).
 *
 * Frequenza consigliata: 1 volta al giorno (o anche più rado: settimanale).
 * Una singola chiamata processa fino a 100k righe (5k * 20 batch); l'arretrato
 * viene smaltito nelle esecuzioni successive.
 *
 * pg_cron schedule example (daily alle 03:00 UTC):
 *   SELECT cron.schedule(
 *     'consent-records-cleanup',
 *     '0 3 * * *',
 *     $$ SELECT net.http_get(
 *          url := 'https://<app>/api/cron/account/consent-records-cleanup',
 *          headers := jsonb_build_object('Authorization', 'Bearer ' || '<CRON_SECRET>')
 *        ); $$
 *   );
 */
export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await purgeStaleConsentRecords();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[cron/consent-records-cleanup] failed:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
